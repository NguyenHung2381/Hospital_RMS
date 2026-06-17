const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');

// Factory for simple lookup tables: departments, categories, levels, roles, research_rounds
// idPrefix: fixed prefix prepended to the random portion of the generated ID
const createCrudService = (tableName, idLength = 20, idPrefix = '') => {
	// Thực thể để phát tín hiệu (vd: roles -> role)
	const entity = tableName.endsWith('s') ? tableName.slice(0, -1) : tableName;

	const getAll = async ({ page = 1, limit = 100, search } = {}) => {
		const pool = await getPool();
		const offset = (page - 1) * limit;
		let where = 'WHERE 1=1';
		const req = pool
			.request()
			.input('offset', sql.Int, offset)
			.input('limit', sql.Int, limit);

		if (search) {
			where += ' AND (name LIKE @search OR description LIKE @search)';
			req.input('search', sql.NVarChar, `%${search}%`);
		}

		const result = await req.query(`
      SELECT * FROM ${tableName} ${where} ORDER BY created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
      SELECT COUNT(*) AS total FROM ${tableName} ${where};
    `);
		return {
			data: result.recordsets[0],
			pagination: { page, limit, total: result.recordsets[1][0].total },
		};
	};

	const getById = async (id) => {
		const pool = await getPool();
		const result = await pool
			.request()
			.input('id', sql.VarChar(idLength), id)
			.query(`SELECT * FROM ${tableName} WHERE id = @id`);
		return result.recordset[0] || null;
	};

	const create = async (data, actorId) => {
		const pool = await getPool();
		const suffixLen = idLength - idPrefix.length;
		const idExpr = idPrefix
			? `'${idPrefix}' + LEFT(REPLACE(NEWID(),'-',''), ${suffixLen})`
			: `LEFT(REPLACE(NEWID(),'-',''), ${idLength})`;
		const result = await pool
			.request()
			.input('actor_id', sql.VarChar(20), actorId)
			.input('name', sql.NVarChar(500), data.name)
			.input('description', sql.NVarChar(sql.MAX), data.description || null)
			.query(`
        DECLARE @new_id VARCHAR(${idLength});
        SET @new_id = ${idExpr};
        EXEC sp_set_actor @actor_id;
        INSERT INTO ${tableName} (id, name, description, created_by)
        VALUES (@new_id, @name, @description, @actor_id);
        SELECT * FROM ${tableName} WHERE id = @new_id;
      `);
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

		await req.query(
			`EXEC sp_set_actor @actor_id; UPDATE ${tableName} SET ${sets.join(', ')} WHERE id = @id`,
		);
		broadcast('update', { entity });
		return getById(id);
	};

	const remove = async (id, actorId) => {
		const pool = await getPool();
		await pool
			.request()
			.input('id', sql.VarChar(idLength), id)
			.input('actor_id', sql.VarChar(20), actorId)
			.query(
				`EXEC sp_set_actor @actor_id; DELETE FROM ${tableName} WHERE id = @id`,
			);
		broadcast('update', { entity });
	};

	return { getAll, getById, create, update, remove };
};

module.exports = { createCrudService };
