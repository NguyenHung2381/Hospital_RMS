// @ts-nocheck — còn lỗi kiểu khi bật checkJs; sửa xong thì xoá dòng này (xem README, Kiểm tra chất lượng)
const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { paging } = require('../../../utils/paging');
const personService = require('../../persons/personService');
const { normalizeGender } = require('../../../utils/gender');
const { ROLE, roleIdOf } = require('../../access/roleCodes');
const { httpError } = require('../../../utils/httpError');

const lecturerSelect = `
  SELECT l.*, u.full_name AS user_full_name, u.username
  FROM lecturers l
  LEFT JOIN users u ON u.id = l.user_id
`;

// Giảng viên chỉ là bác sĩ/nhân viên nội viện (users) hoặc chuyên gia ngoài viện —
// không gắn được tài khoản học viên (vai trò trainee — do "Cấp tài khoản học viên" sinh ra).
const assertNotTraineeAccount = async (pool, userId) => {
	if (!userId) return;
	const r = await pool
		.request()
		.input('uid', sql.VarChar(20), userId)
		.query('SELECT role_id FROM users WHERE id = @uid');
	const roleId = r.recordset[0]?.role_id;
	if (roleId && roleId === (await roleIdOf(ROLE.TRAINEE))) {
		throw httpError(400, 'Không thể dùng tài khoản học viên làm giảng viên.');
	}
};

const getAll = async ({ page = 1, limit = 20, search, active_only } = {}) => {
	const pool = await getPool();
	const pg = paging(page, limit, 100);
	const where = ['1=1'];
	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);

	if (active_only !== 'false') where.push('l.is_active = 1');
	if (search) {
		where.push('(l.full_name LIKE @search OR l.specialty LIKE @search OR l.email LIKE @search)');
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	const whereSql = `WHERE ${where.join(' AND ')}`;

	const result = await req.query(`
    ${lecturerSelect} ${whereSql} ORDER BY l.full_name
    ${pg.fetchClause};
    SELECT COUNT(*) AS total FROM lecturers l ${whereSql};
  `);
	return {
		data: result.recordsets[0],
		pagination: { page: pg.page, limit: pg.limit, total: result.recordsets[1][0].total },
	};
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query(`${lecturerSelect} WHERE l.id = @id`);
	return result.recordset[0] || null;
};

const create = async (data, actorId) => {
	const pool = await getPool();
	await assertNotTraineeAccount(pool, data.user_id);
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('user_id', sql.VarChar(20), data.user_id || null)
		.input('full_name', sql.NVarChar(150), data.full_name)
		.input('specialty', sql.NVarChar(150), data.specialty || null)
		.input('is_external', sql.Bit, !!data.is_external)
		.input('phone', sql.VarChar(20), data.phone || null)
		.input('email', sql.VarChar(100), data.email || null)
		.input('academic_degree', sql.NVarChar(50), data.academic_degree || null)
		.input('academic_rank', sql.NVarChar(50), data.academic_rank || null)
		.input('dob', sql.Date, data.dob || null)
		.input('gender', sql.VarChar(10), normalizeGender(data.gender))
		.input('avatar_url', sql.NVarChar(500), data.avatar_url || null).query(`
      DECLARE @new_id VARCHAR(20) = 'GV' + LEFT(REPLACE(NEWID(),'-',''), 18);
      EXEC sp_set_actor @actor_id;
      INSERT INTO lecturers (id, user_id, full_name, specialty, is_external, phone, email, academic_degree, academic_rank, dob, gender, avatar_url, created_by)
      VALUES (@new_id, @user_id, @full_name, @specialty, @is_external, @phone, @email, @academic_degree, @academic_rank, @dob, @gender, @avatar_url, @actor_id);
      SELECT @new_id AS id;
    `);
	const id = result.recordset[0].id;
	await personService.syncPerson('lecturers', id, { actorId });
	broadcast('update', { entity: 'lecturer' });
	return getById(id);
};

const update = async (id, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId);

	if (data.user_id !== undefined) {
		await assertNotTraineeAccount(pool, data.user_id);
		sets.push('user_id = @user_id');
		req.input('user_id', sql.VarChar(20), data.user_id || null);
	}
	if (data.full_name !== undefined) {
		sets.push('full_name = @full_name');
		req.input('full_name', sql.NVarChar(150), data.full_name);
	}
	if (data.specialty !== undefined) {
		sets.push('specialty = @specialty');
		req.input('specialty', sql.NVarChar(150), data.specialty || null);
	}
	if (data.is_external !== undefined) {
		sets.push('is_external = @is_external');
		req.input('is_external', sql.Bit, !!data.is_external);
	}
	if (data.phone !== undefined) {
		sets.push('phone = @phone');
		req.input('phone', sql.VarChar(20), data.phone || null);
	}
	if (data.email !== undefined) {
		sets.push('email = @email');
		req.input('email', sql.VarChar(100), data.email || null);
	}
	if (data.is_active !== undefined) {
		sets.push('is_active = @is_active');
		req.input('is_active', sql.Bit, !!data.is_active);
	}
	if (data.academic_degree !== undefined) {
		sets.push('academic_degree = @academic_degree');
		req.input('academic_degree', sql.NVarChar(50), data.academic_degree || null);
	}
	if (data.academic_rank !== undefined) {
		sets.push('academic_rank = @academic_rank');
		req.input('academic_rank', sql.NVarChar(50), data.academic_rank || null);
	}
	if (data.dob !== undefined) {
		sets.push('dob = @dob');
		req.input('dob', sql.Date, data.dob || null);
	}
	if (data.gender !== undefined) {
		sets.push('gender = @gender');
		req.input('gender', sql.VarChar(10), normalizeGender(data.gender));
	}
	if (data.avatar_url !== undefined) {
		sets.push('avatar_url = @avatar_url');
		req.input('avatar_url', sql.NVarChar(500), data.avatar_url || null);
	}

	await req.query(
		`EXEC sp_set_actor @actor_id; UPDATE lecturers SET ${sets.join(', ')} WHERE id = @id`,
	);
	await personService.syncPerson('lecturers', id, { actorId });
	broadcast('update', { entity: 'lecturer' });
	return getById(id);
};

// Xoá cứng nếu chưa từng được phân công; nếu đã có lịch sử phân công (Giai
// đoạn 4: lecturer_assignments), chỉ vô hiệu hoá để giữ tên hiển thị ở lịch sử.
const remove = async (id, actorId) => {
	const pool = await getPool();
	let used = { recordset: [] };
	try {
		used = await pool
			.request()
			.input('id', sql.VarChar(20), id)
			.query('SELECT TOP 1 1 AS x FROM lecturer_assignments WHERE lecturer_id = @id');
	} catch {
		// Bảng lecturer_assignments chưa tồn tại (Giai đoạn 4 chưa chạy) ⇒ coi như chưa dùng.
	}
	if (used.recordset.length) {
		await pool
			.request()
			.input('id', sql.VarChar(20), id)
			.input('actor_id', sql.VarChar(20), actorId)
			.query('EXEC sp_set_actor @actor_id; UPDATE lecturers SET is_active = 0 WHERE id = @id');
	} else {
		await pool
			.request()
			.input('id', sql.VarChar(20), id)
			.input('actor_id', sql.VarChar(20), actorId)
			.query('EXEC sp_set_actor @actor_id; DELETE FROM lecturers WHERE id = @id');
	}
	broadcast('update', { entity: 'lecturer' });
};

module.exports = { getAll, getById, create, update, remove };
