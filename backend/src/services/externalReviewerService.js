const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');
const personService = require('./personService');

const getAll = async ({ search, specialty_group, active_only } = {}) => {
	const pool = await getPool();
	let where = 'WHERE 1=1';
	const req = pool.request();

	if (active_only !== 'false') {
		where += ' AND is_active = 1';
	}
	if (specialty_group) {
		where += ' AND specialty_group = @specialty_group';
		req.input('specialty_group', sql.NVarChar(100), specialty_group);
	}
	if (search) {
		where += ' AND (full_name LIKE @search OR organization LIKE @search)';
		req.input('search', sql.NVarChar, `%${search}%`);
	}

	const result = await req.query(`
    SELECT * FROM external_reviewers
    ${where}
    ORDER BY full_name
  `);
	return result.recordset;
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query('SELECT * FROM external_reviewers WHERE id = @id');
	return result.recordset[0] || null;
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const idResult = await pool
		.request()
		.output('new_id', sql.VarChar(20))
		.execute('sp_gen_external_reviewer_id');
	const newId = idResult.output.new_id;

	await pool
		.request()
		.input('id', sql.VarChar(20), newId)
		.input('full_name', sql.NVarChar(150), data.full_name)
		.input('organization', sql.NVarChar(200), data.organization || null)
		.input('specialty_group', sql.NVarChar(100), data.specialty_group || null)
		.input('phone', sql.VarChar(20), data.phone || null)
		.input('email', sql.VarChar(100), data.email || null)
		.input('note', sql.NVarChar(500), data.note || null)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      INSERT INTO external_reviewers (id, full_name, organization, specialty_group, phone, email, note, created_by)
      VALUES (@id, @full_name, @organization, @specialty_group, @phone, @email, @note, @actor_id);
    `);
	await personService.syncPerson('external_reviewers', newId, { actorId });
	const reviewer = await getById(newId);
	broadcast('update', { entity: 'external_reviewer' });
	return reviewer;
};

const update = async (id, data, actorId) => {
	const pool = await getPool();
	const sets = [];
	const req = pool.request().input('id', sql.VarChar(20), id);

	if (data.full_name !== undefined) {
		sets.push('full_name = @full_name');
		req.input('full_name', sql.NVarChar(150), data.full_name);
	}
	if (data.organization !== undefined) {
		sets.push('organization = @organization');
		req.input('organization', sql.NVarChar(200), data.organization || null);
	}
	if (data.specialty_group !== undefined) {
		sets.push('specialty_group = @specialty_group');
		req.input('specialty_group', sql.NVarChar(100), data.specialty_group || null);
	}
	if (data.phone !== undefined) {
		sets.push('phone = @phone');
		req.input('phone', sql.VarChar(20), data.phone || null);
	}
	if (data.email !== undefined) {
		sets.push('email = @email');
		req.input('email', sql.VarChar(100), data.email || null);
	}
	if (data.note !== undefined) {
		sets.push('note = @note');
		req.input('note', sql.NVarChar(500), data.note || null);
	}
	if (data.is_active !== undefined) {
		sets.push('is_active = @is_active');
		req.input('is_active', sql.Bit, !!data.is_active);
	}
	if (!sets.length) return getById(id);

	req.input('actor_id', sql.VarChar(20), actorId);
	await req.query(`UPDATE external_reviewers SET ${sets.join(', ')}, updated_at = GETDATE(), updated_by = @actor_id WHERE id = @id`);
	await personService.syncPerson('external_reviewers', id, { actorId });
	const reviewer = await getById(id);
	broadcast('update', { entity: 'external_reviewer' });
	return reviewer;
};

// Xoá cứng chỉ khi chưa từng ngồi ghế nào; nếu đã có lịch sử, chỉ vô hiệu hoá
// (is_active = 0) để giữ nguyên tên hiển thị trên các hội đồng cũ.
const remove = async (id, actorId) => {
	const pool = await getPool();
	const used = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query('SELECT TOP 1 1 FROM council_members WHERE external_reviewer_id = @id');
	if (used.recordset.length) {
		await pool
			.request()
			.input('id', sql.VarChar(20), id)
			.input('actor_id', sql.VarChar(20), actorId || null)
			.query('UPDATE external_reviewers SET is_active = 0, updated_at = GETDATE(), updated_by = @actor_id WHERE id = @id');
	} else {
		await pool
			.request()
			.input('id', sql.VarChar(20), id)
			.query('DELETE FROM external_reviewers WHERE id = @id');
	}
	broadcast('update', { entity: 'external_reviewer' });
};

module.exports = { getAll, getById, create, update, remove };
