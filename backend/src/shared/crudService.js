const { getPool, sql } = require('../config/db');
const { broadcast } = require('../modules/events/eventService');
const { paging } = require('../utils/paging');
const { remember, invalidate } = require('../utils/cache');

// Factory for simple lookup tables: departments, categories, levels, roles, round_types, research_rounds
// idPrefix: fixed prefix prepended to the random portion of the generated ID
// deleteGuards: [{ table, column, label }] — trước khi xoá sẽ đếm số dòng con đang
//   tham chiếu tới id này; nếu còn thì trả lỗi 409 thay vì để DB ném FK 547.
// extraFields: [{ column, sqlType }] — cột phụ ngoài name/description (vd:
//   cme_credit_categories.group_id/conversion_method/conversion_value/unit_label)
//   được set/update cùng lúc, giá trị mặc định NULL nếu không truyền.
// options.allowCustomId: cho phép client tự đặt mã (data.id, vd DT_KHOAHOC của
//   danh mục quy đổi CME); bỏ trống thì vẫn sinh ngẫu nhiên như cũ. Trùng mã ⇒
//   SQL 2627, errorHandler trả 409.
const createCrudService = (
	tableName,
	idLength = 20,
	idPrefix = '',
	deleteGuards = [],
	extraFields = [],
	options = {},
) => {
	// Thực thể để phát tín hiệu (vd: roles -> role)
	const entity = tableName.endsWith('s') ? tableName.slice(0, -1) : tableName;
	// Prefix cache riêng theo bảng — invalidate(cachePrefix) sau mỗi lần ghi sẽ
	// xoá sạch mọi key getAll (mọi trang/search) lẫn getById của bảng này.
	const cachePrefix = `lookup:${tableName}:`;

	const getAll = async ({ page = 1, limit = 100, search } = {}) => {
		const key = `${cachePrefix}all:${page}:${limit}:${search || ''}`;
		return remember(key, 300, async () => {
			const pool = await getPool();
			const pg = paging(page, limit, 100);
			let where = 'WHERE 1=1';
			const req = pool
				.request()
				.input('offset', sql.Int, pg.offset)
				.input('limit', sql.Int, pg.limit);

			if (search) {
				where += ' AND (name LIKE @search OR description LIKE @search)';
				req.input('search', sql.NVarChar, `%${search}%`);
			}

			const result = await req.query(`
        SELECT * FROM ${tableName} ${where} ORDER BY created_at DESC
        ${pg.fetchClause};
        SELECT COUNT(*) AS total FROM ${tableName} ${where};
      `);
			return {
				data: result.recordsets[0],
				pagination: { page: pg.page, limit: pg.limit, total: result.recordsets[1][0].total },
			};
		});
	};

	const getById = async (id) => {
		return remember(`${cachePrefix}id:${id}`, 300, async () => {
			const pool = await getPool();
			const result = await pool
				.request()
				.input('id', sql.VarChar(idLength), id)
				.query(`SELECT * FROM ${tableName} WHERE id = @id`);
			return result.recordset[0] || null;
		});
	};

	const create = async (data, actorId) => {
		const pool = await getPool();
		const suffixLen = idLength - idPrefix.length;
		const customId = options.allowCustomId && data.id ? String(data.id).trim() : '';
		const idExpr = customId
			? '@custom_id'
			: idPrefix
				? `'${idPrefix}' + LEFT(REPLACE(NEWID(),'-',''), ${suffixLen})`
				: `LEFT(REPLACE(NEWID(),'-',''), ${idLength})`;
		const req = pool
			.request()
			.input('custom_id', sql.VarChar(idLength), customId || null)
			.input('actor_id', sql.VarChar(20), actorId)
			.input('name', sql.NVarChar(500), data.name)
			.input('description', sql.NVarChar(sql.MAX), data.description || null);

		for (const f of extraFields) {
			req.input(
				f.column,
				f.sqlType,
				data[f.column] !== undefined ? data[f.column] : (f.default ?? null),
			);
		}
		const extraCols = extraFields.map((f) => f.column);
		const insertCols = ['id', 'name', 'description', ...extraCols, 'created_by'].join(', ');
		const insertVals = [
			'@new_id',
			'@name',
			'@description',
			...extraCols.map((c) => `@${c}`),
			'@actor_id',
		].join(', ');

		const result = await req.query(`
        DECLARE @new_id VARCHAR(${idLength});
        SET @new_id = ${idExpr};
        EXEC sp_set_actor @actor_id;
        INSERT INTO ${tableName} (${insertCols})
        VALUES (${insertVals});
        SELECT * FROM ${tableName} WHERE id = @new_id;
      `);
		await invalidate(cachePrefix);
		broadcast('update', { entity });
		return result.recordset[0];
	};

	const update = async (id, data, actorId) => {
		const pool = await getPool();
		const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
		const req = pool
			.request()
			.input('id', sql.VarChar(idLength), id)
			.input('actor_id', sql.VarChar(20), actorId);

		if (data.name !== undefined) {
			sets.push('name = @name');
			req.input('name', sql.NVarChar(500), data.name);
		}
		if (data.description !== undefined) {
			sets.push('description = @description');
			req.input('description', sql.NVarChar(sql.MAX), data.description);
		}
		for (const f of extraFields) {
			if (data[f.column] !== undefined) {
				sets.push(`${f.column} = @${f.column}`);
				req.input(f.column, f.sqlType, data[f.column]);
			}
		}

		await req.query(
			`EXEC sp_set_actor @actor_id; UPDATE ${tableName} SET ${sets.join(', ')} WHERE id = @id`,
		);
		// Xoá cache trước khi getById để không trả lại bản ghi cũ vừa cache.
		await invalidate(cachePrefix);
		broadcast('update', { entity });
		return getById(id);
	};

	const remove = async (id, actorId) => {
		const pool = await getPool();

		if (deleteGuards.length) {
			const selects = deleteGuards
				.map((g, i) => `(SELECT COUNT(*) FROM ${g.table} WHERE ${g.column} = @id) AS c${i}`)
				.join(', ');
			const res = await pool
				.request()
				.input('id', sql.VarChar(idLength), id)
				.query(`SELECT ${selects}`);
			const row = res.recordset[0];
			const parts = deleteGuards
				.map((g, i) => (row[`c${i}`] > 0 ? `${row[`c${i}`]} ${g.label}` : null))
				.filter(Boolean);
			if (parts.length) {
				const err = new Error(
					`Không thể xoá vì đang có ${parts.join(', ')} liên kết. Hãy gỡ hoặc chuyển liên kết sang mục khác trước.`,
				);
				err.statusCode = 409;
				throw err;
			}
		}

		await pool
			.request()
			.input('id', sql.VarChar(idLength), id)
			.input('actor_id', sql.VarChar(20), actorId)
			.query(`EXEC sp_set_actor @actor_id; DELETE FROM ${tableName} WHERE id = @id`);
		await invalidate(cachePrefix);
		broadcast('update', { entity });
	};

	return { getAll, getById, create, update, remove };
};

module.exports = { createCrudService };
