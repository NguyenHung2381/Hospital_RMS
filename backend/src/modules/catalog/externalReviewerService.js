const {
	getPool,
	sql,
	withActorTransaction,
	actorRequest,
	nowSql,
	ilike,
} = require('../../config/db');
const { genExternalReviewerId } = require('../../utils/idGenerator');
const { broadcast } = require('../events/eventService');
const personService = require('../persons/personService');
const { addSets } = require('../../utils/sqlUpdate');

const getAll = async ({
	search = undefined,
	specialty_group = undefined,
	active_only = undefined,
} = {}) => {
	const pool = await getPool();
	let where = 'WHERE 1=1';
	const req = pool.request();

	if (active_only !== 'false') {
		where += " AND is_active = 'true'";
	}
	if (specialty_group) {
		where += ' AND specialty_group = @specialty_group';
		req.input('specialty_group', sql.NVarChar(100), specialty_group);
	}
	if (search) {
		where += ` AND (${ilike('full_name', '@search')} OR ${ilike('organization', '@search')})`;
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
	const newId = await withActorTransaction(actorId, async (tx) => {
		const id = await genExternalReviewerId(tx);
		await tx
			.request()
			.input('id', sql.VarChar(20), id)
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
		return id;
	});
	await personService.syncPerson('external_reviewers', newId, { actorId });
	const reviewer = await getById(newId);
	broadcast('update', { entity: 'external_reviewer' });
	return reviewer;
};

const update = async (id, data, actorId) => {
	const sets = [];
	// actorRequest: câu UPDATE chạy trong transaction có người thao tác (trigger audit)
	const req = actorRequest(actorId).input('id', sql.VarChar(20), id);

	addSets(req, sets, data, {
		full_name: sql.NVarChar(150),
		organization: [sql.NVarChar(200), { orNull: true }],
		specialty_group: [sql.NVarChar(100), { orNull: true }],
		phone: [sql.VarChar(20), { orNull: true }],
		email: [sql.VarChar(100), { orNull: true }],
		note: [sql.NVarChar(500), { orNull: true }],
	});
	if (data.is_active !== undefined) {
		sets.push('is_active = @is_active');
		req.input('is_active', sql.Bit, !!data.is_active);
	}
	if (!sets.length) return getById(id);

	req.input('actor_id', sql.VarChar(20), actorId);
	await req.query(
		`UPDATE external_reviewers SET ${sets.join(', ')}, updated_at = ${nowSql}, updated_by = @actor_id WHERE id = @id`,
	);
	await personService.syncPerson('external_reviewers', id, { actorId });
	const reviewer = await getById(id);
	broadcast('update', { entity: 'external_reviewer' });
	return reviewer;
};

// Xóa cứng chỉ khi chưa từng ngồi ghế nào; nếu đã có lịch sử, chỉ vô hiệu hóa
// (is_active = false) để giữ nguyên tên hiển thị trên các hội đồng cũ.
const remove = async (id, actorId) => {
	const pool = await getPool();
	const used = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query(
			'SELECT 1 WHERE EXISTS (SELECT 1 FROM council_members WHERE external_reviewer_id = @id)',
		);
	// Vô hiệu hoá / xoá trong transaction có người thao tác (trigger audit ghi được ai xoá)
	if (used.recordset.length) {
		await actorRequest(actorId)
			.input('id', sql.VarChar(20), id)
			.input('actor_id', sql.VarChar(20), actorId || null)
			.query(
				`UPDATE external_reviewers SET is_active = 'false', updated_at = ${nowSql}, updated_by = @actor_id WHERE id = @id`,
			);
	} else {
		await actorRequest(actorId)
			.input('id', sql.VarChar(20), id)
			.query('DELETE FROM external_reviewers WHERE id = @id');
	}
	broadcast('update', { entity: 'external_reviewer' });
};

module.exports = { getAll, getById, create, update, remove };
