const { getPool, sql, withActorTransaction, nowSql } = require('../../config/db');
const { broadcast } = require('../events/eventService');
const { httpError } = require('../../utils/httpError');

// ─── Topic assignment (many topics -> one council per round) ─────────────────

const getUnassignedTopics = async (roundId) => {
	const pool = await getPool();
	const result = await pool.request().input('round_id', sql.VarChar(10), roundId).query(`
      SELECT t.id, t.title, t.status, t.session, t.department_id, d.name AS department_name
      FROM topics t
      LEFT JOIN departments d ON d.id = t.department_id
      WHERE t.round_id = @round_id AND t.council_id IS NULL
      ORDER BY d.name, t.created_at
    `);
	return result.recordset;
};

const getTopics = async (councilId) => {
	const pool = await getPool();
	const result = await pool.request().input('council_id', sql.VarChar(15), councilId).query(`
      SELECT t.id, t.title, t.status, t.session, t.department_id, d.name AS department_name
      FROM topics t
      LEFT JOIN departments d ON d.id = t.department_id
      WHERE t.council_id = @council_id
      ORDER BY t.created_at
    `);
	return result.recordset;
};

// Chỉ gán được đề tài cùng đợt (round_id) với hội đồng.
const assignTopics = async (councilId, topicIds, actorId) => {
	if (!Array.isArray(topicIds) || topicIds.length === 0) return { assigned: 0 };

	const idParams = topicIds.map((_, i) => `@id${i}`).join(',');
	const moved = `id IN (${idParams})
      AND round_id = (SELECT round_id FROM councils WHERE id = @council_id)`;

	const result = await withActorTransaction(actorId, async (tx) => {
		const req = () => {
			const r = tx
				.request()
				.input('actor_id', sql.VarChar(20), actorId)
				.input('council_id', sql.VarChar(15), councilId);
			topicIds.forEach((id, i) => r.input(`id${i}`, sql.VarChar(15), id));
			return r;
		};
		// Đề tài chuyển từ hội đồng khác sang: ghế thay thế (theo đề tài) là của hội
		// đồng cũ — xóa trước, không để người thay ghế cũ giữ quyền chủ tịch/thư ký
		// với đề tài ở hội đồng mới (councilProgressService.SEAT_CTE).
		await req().query(`
      DELETE FROM council_seat_substitutes WHERE topic_id IN (
        SELECT id FROM topics WHERE ${moved} AND council_id IS NOT NULL AND council_id <> @council_id)`);
		return req().query(`UPDATE topics SET council_id = @council_id WHERE ${moved}`);
	});
	broadcast('update', { entity: 'topic' });
	return { assigned: result.rowsAffected[0] ?? 0 };
};

const unassignTopic = async (councilId, topicId, actorId) => {
	await withActorTransaction(actorId, async (tx) => {
		const r = await tx
			.request()
			.input('actor_id', sql.VarChar(20), actorId)
			.input('council_id', sql.VarChar(15), councilId)
			.input('topic_id', sql.VarChar(15), topicId)
			.query(
				'UPDATE topics SET council_id = NULL WHERE id = @topic_id AND council_id = @council_id',
			);
		// Đề tài rời hội đồng ⇒ ghế thay thế theo đề tài hết hiệu lực
		if (r.rowsAffected[0])
			await tx
				.request()
				.input('topic_id', sql.VarChar(15), topicId)
				.query('DELETE FROM council_seat_substitutes WHERE topic_id = @topic_id');
	});
	broadcast('update', { entity: 'topic' });
};

// Đặt buổi bảo vệ (sáng/chiều) cho một đề tài đã gán vào hội đồng.
const setTopicSession = async (councilId, topicId, session, actorId) => {
	const result = await withActorTransaction(actorId, (tx) =>
		tx
			.request()
			.input('actor_id', sql.VarChar(20), actorId)
			.input('council_id', sql.VarChar(15), councilId)
			.input('topic_id', sql.VarChar(15), topicId)
			.input('session', sql.VarChar(10), session || null).query(`
      UPDATE topics SET session = @session
      WHERE id = @topic_id AND council_id = @council_id
    `),
	);
	if (!result.rowsAffected[0]) {
		throw Object.assign(new Error('Đề tài không thuộc hội đồng này.'), { status: 404 });
	}
	broadcast('update', { entity: 'topic' });
};

// Ghế thay thế theo đề tài: với một đề tài cụ thể, thay người ngồi một ghế của
// hội đồng (thành viên gốc là tác giả, hoặc cần chuyên gia đúng ngành phản biện).
const setSeatSubstitute = async (councilId, topicId, role, userId, actorId) => {
	const ok = await withActorTransaction(actorId, async (tx) => {
		const req = () =>
			tx
				.request()
				.input('actor_id', sql.VarChar(20), actorId)
				.input('topic_id', sql.VarChar(15), topicId)
				.input('role', sql.VarChar(15), role)
				.input('user_id', sql.VarChar(20), userId);
		const found = await req()
			.input('council_id', sql.VarChar(15), councilId)
			.query('SELECT 1 AS x FROM topics WHERE id = @topic_id AND council_id = @council_id');
		if (!found.recordset.length) return false;
		// Có ghế thay rồi thì sửa, chưa có thì thêm (cùng transaction).
		const upd = await req().query(`
        UPDATE council_seat_substitutes
        SET user_id = @user_id, created_by = @actor_id, updated_at = ${nowSql}, updated_by = @actor_id
        WHERE topic_id = @topic_id AND role = @role`);
		if (!upd.rowsAffected[0]) {
			await req().query(`
          INSERT INTO council_seat_substitutes (topic_id, role, user_id, created_by)
          VALUES (@topic_id, @role, @user_id, @actor_id)`);
		}
		return true;
	});
	if (!ok) {
		throw httpError(404, 'Đề tài không thuộc hội đồng này.');
	}
	broadcast('update', { entity: 'council' });
};

const removeSeatSubstitute = async (councilId, topicId, role, actorId) => {
	await withActorTransaction(actorId, (tx) =>
		tx
			.request()
			.input('actor_id', sql.VarChar(20), actorId)
			.input('council_id', sql.VarChar(15), councilId)
			.input('topic_id', sql.VarChar(15), topicId)
			.input('role', sql.VarChar(15), role).query(`
      DELETE FROM council_seat_substitutes
      WHERE topic_id = @topic_id AND role = @role
        AND topic_id IN (SELECT id FROM topics WHERE council_id = @council_id)
    `),
	);
	broadcast('update', { entity: 'council' });
};

module.exports = {
	getUnassignedTopics,
	getTopics,
	assignTopics,
	unassignTopic,
	setTopicSession,
	setSeatSubstitute,
	removeSeatSubstitute,
};
