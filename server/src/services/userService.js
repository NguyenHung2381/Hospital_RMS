const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');
const { paging } = require('../utils/paging');

// department_id/account_type nhận danh sách phân tách bởi dấu phẩy (multi-select trên UI)
const splitList = (v) => (v ? String(v).split(',').filter(Boolean) : []);

// Thêm mệnh đề IN (...) với tham số đặt tên riêng theo prefix, tránh đụng tên giữa các lần gọi
const inClause = (req, col, prefix, values, sqlType) => {
	if (!values.length) return null;
	const names = values.map((v, i) => {
		const name = `${prefix}${i}`;
		req.input(name, sqlType, v);
		return `@${name}`;
	});
	return `${col} IN (${names.join(', ')})`;
};

const getAll = async ({
	page = 1,
	limit = 20,
	search,
	department_id,
	role_id,
	account_type,
	is_active,
}) => {
	const pool = await getPool();
	const pg = paging(page, limit);
	const deptIds = splitList(department_id);
	const accountTypes = splitList(account_type);

	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);

	// Mệnh đề dùng chung (search/role/is_active) — không phụ thuộc dept/loại tài khoản
	const baseClauses = ['1=1'];
	if (search) {
		baseClauses.push(
			'(u.username LIKE @search OR u.full_name LIKE @search OR u.email LIKE @search OR CAST(u.staff_number AS VARCHAR(20)) LIKE @search)',
		);
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	if (role_id) {
		baseClauses.push('u.role_id = @role_id');
		req.input('role_id', sql.VarChar(20), role_id);
	}
	if (is_active !== undefined) {
		baseClauses.push('u.is_active = @is_active');
		req.input('is_active', sql.Bit, is_active);
	}

	const deptClause = inClause(req, 'u.department_id', 'dept', deptIds, sql.VarChar(20));
	const typeClause = inClause(req, 'u.account_type', 'atype', accountTypes, sql.VarChar(20));

	const whereAll = ['WHERE', [...baseClauses, deptClause, typeClause].filter(Boolean).join(' AND ')].join(' ');
	// Đếm theo loại tài khoản: bỏ qua bộ lọc loại tài khoản (để hiện số lượng nếu chọn thêm loại khác)
	const whereForTypeFacet = ['WHERE', [...baseClauses, deptClause].filter(Boolean).join(' AND ')].join(' ');
	// Đếm theo khoa/phòng: bỏ qua bộ lọc khoa/phòng
	const whereForDeptFacet = ['WHERE', [...baseClauses, typeClause].filter(Boolean).join(' AND ')].join(' ');

	const result = await req.query(`
    SELECT u.id, u.username, u.staff_number, u.full_name, u.email, u.account_type, u.is_active,
           u.department_id, d.name AS department_name,
           u.role_id, r.name AS role_name,
           u.can_sit_council, u.can_chair_council,
           u.password_changed_at, u.created_at, u.updated_at
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN roles r ON r.id = u.role_id
    ${whereAll}
    ORDER BY u.created_at DESC
    ${pg.fetchClause};

    SELECT COUNT(*) AS total FROM users u ${whereAll};

    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN u.is_active = 1 THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN u.is_active = 0 THEN 1 ELSE 0 END) AS inactive,
      SUM(CASE WHEN u.password_changed_at IS NULL
               OR DATEDIFF(day, u.password_changed_at, GETDATE()) > 90
          THEN 1 ELSE 0 END) AS pwd_warn
    FROM users u;

    SELECT u.account_type, COUNT(*) AS count
    FROM users u ${whereForTypeFacet}
    GROUP BY u.account_type;

    SELECT u.department_id, COUNT(*) AS count
    FROM users u ${whereForDeptFacet}
    GROUP BY u.department_id;
  `);

	const [rows, totalRows, globalStatsRows, typeCountRows, deptCountRows] =
		result.recordsets;

	return {
		data: rows,
		pagination: { page: pg.page, limit: pg.limit, total: totalRows[0].total },
		global_stats: {
			total: globalStatsRows[0].total,
			active: globalStatsRows[0].active,
			inactive: globalStatsRows[0].inactive,
			pwd_warn: globalStatsRows[0].pwd_warn,
		},
		type_counts: Object.fromEntries(
			typeCountRows.map((r) => [r.account_type, r.count]),
		),
		dept_counts: Object.fromEntries(
			deptCountRows
				.filter((r) => r.department_id)
				.map((r) => [r.department_id, r.count]),
		),
	};
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(20), id).query(`
      SELECT u.id, u.username, u.staff_number, u.full_name, u.email, u.account_type, u.is_active,
             u.department_id, d.name AS department_name,
             u.role_id, r.name AS role_name,
             u.can_sit_council, u.can_chair_council,
             u.password_changed_at, u.created_at, u.updated_at
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = @id
    `);
	return result.recordset[0] || null;
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const hashed = await bcrypt.hash(data.password, 10);

	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('username', sql.VarChar(50), data.username)
		.input('password', sql.VarChar(255), hashed)
		.input(
			'staff_number',
			sql.Int,
			data.staff_number != null && data.staff_number !== ''
				? parseInt(String(data.staff_number), 10)
				: null,
		)
		.input('full_name', sql.NVarChar(200), data.full_name)
		.input('email', sql.VarChar(100), data.email || null)
		.input('department_id', sql.VarChar(20), data.department_id || null)
		.input('role_id', sql.VarChar(20), data.role_id || null)
		.input('account_type', sql.VarChar(15), data.account_type || 'member')
		.query(`
      DECLARE @new_id VARCHAR(20);
      SET @new_id = 'NV' + LEFT(REPLACE(NEWID(), '-', ''), 8);
      EXEC sp_set_actor @actor_id;
      INSERT INTO users (id, username, password, staff_number, full_name, email, department_id, role_id, account_type, created_by)
      VALUES (@new_id, @username, @password, @staff_number, @full_name, @email, @department_id, @role_id, @account_type, @actor_id);
      SELECT @new_id AS id;
    `);

	const user = await getById(result.recordset[0].id);
	broadcast('update', { entity: 'user' });
	return user;
};

const update = async (id, data, actorId) => {
	const pool = await getPool();

	const sets = [];
	const req = pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId);

	if (data.staff_number !== undefined) {
		sets.push('staff_number = @staff_number');
		req.input(
			'staff_number',
			sql.Int,
			data.staff_number != null && data.staff_number !== ''
				? parseInt(String(data.staff_number), 10)
				: null,
		);
	}
	if (data.full_name !== undefined) {
		sets.push('full_name = @full_name');
		req.input('full_name', sql.NVarChar(200), data.full_name);
	}
	if (data.email !== undefined) {
		sets.push('email = @email');
		req.input('email', sql.VarChar(100), data.email);
	}
	if (data.department_id !== undefined) {
		sets.push('department_id = @department_id');
		req.input('department_id', sql.VarChar(20), data.department_id);
	}
	if (data.role_id !== undefined) {
		sets.push('role_id = @role_id');
		req.input('role_id', sql.VarChar(20), data.role_id);
	}
	if (data.account_type !== undefined) {
		sets.push('account_type = @account_type');
		req.input('account_type', sql.VarChar(15), data.account_type);
	}
	if (data.is_active !== undefined) {
		sets.push('is_active = @is_active');
		req.input('is_active', sql.Bit, data.is_active);
	}
	if (data.can_sit_council !== undefined) {
		sets.push('can_sit_council = @can_sit_council');
		req.input('can_sit_council', sql.Bit, data.can_sit_council);
	}
	if (data.can_chair_council !== undefined) {
		sets.push('can_chair_council = @can_chair_council');
		req.input('can_chair_council', sql.Bit, data.can_chair_council);
	}

	if (!sets.length) return getById(id);

	sets.push('updated_at = GETDATE()', 'updated_by = @actor_id');
	await req.query(
		`EXEC sp_set_actor @actor_id; UPDATE users SET ${sets.join(', ')} WHERE id = @id`,
	);
	const user = await getById(id);
	broadcast('update', { entity: 'user' });
	return user;
};

const remove = async (id, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId).query(`
			EXEC sp_set_actor @actor_id;
			UPDATE topic_members SET user_id = NULL, account_granted = 0, account_granted_at = NULL WHERE user_id = @id;
			UPDATE round_deadlines SET created_by = @actor_id WHERE created_by = @id;
			DELETE FROM users WHERE id = @id;
		`);
	broadcast('update', { entity: 'user' });
};

const resetPassword = async (id, newPassword, actorId) => {
	const pool = await getPool();
	const hashed = await bcrypt.hash(newPassword, 10);
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('password', sql.VarChar(255), hashed)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(
			`EXEC sp_set_actor @actor_id; UPDATE users SET password=@password, password_changed_at=GETDATE(), updated_at=GETDATE(), updated_by=@actor_id WHERE id=@id`,
		);
	broadcast('update', { entity: 'user' });
};

const searchForMember = async ({ q, department_id, limit = 10 }) => {
	const pool = await getPool();
	let where = 'WHERE u.is_active = 1';
	const req = pool.request().input('limit', sql.Int, Number(limit));

	if (q && q.trim()) {
		where +=
			' AND (u.username LIKE @search OR u.full_name LIKE @search OR CAST(u.staff_number AS VARCHAR(20)) LIKE @search)';
		req.input('search', sql.NVarChar, `%${q.trim()}%`);
	}
	if (department_id) {
		where += ' AND u.department_id = @dept';
		req.input('dept', sql.VarChar(20), department_id);
	}

	const result = await req.query(`
    SELECT TOP (@limit) u.id, u.full_name, u.username, u.staff_number, u.email, u.department_id
    FROM users u
    ${where}
    ORDER BY u.full_name
  `);

	return {
		data: result.recordset,
		pagination: {
			page: 1,
			limit: Number(limit),
			total: result.recordset.length,
		},
	};
};

module.exports = {
	getAll,
	getById,
	create,
	update,
	remove,
	resetPassword,
	searchForMember,
};
