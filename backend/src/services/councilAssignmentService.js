const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');
const { httpError } = require('../utils/httpError');

// ─── Topic assignment (many topics -> one council per round) ─────────────────

const getUnassignedTopics = async (roundId) => {
	const pool = await getPool();
	const result = await pool.request().input('round_id', sql.VarChar(10), roundId).query(`
      SELECT t.id, t.title, t.status, t.[session], t.department_id, d.name AS department_name
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
      SELECT t.id, t.title, t.status, t.[session], t.department_id, d.name AS department_name
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
	const pool = await getPool();

	const req = pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('council_id', sql.VarChar(15), councilId);
	topicIds.forEach((id, i) => req.input(`id${i}`, sql.VarChar(15), id));
	const idParams = topicIds.map((_, i) => `@id${i}`).join(',');

	const result = await req.query(`
    EXEC sp_set_actor @actor_id;
    UPDATE topics
    SET council_id = @council_id
    WHERE id IN (${idParams})
      AND round_id = (SELECT round_id FROM councils WHERE id = @council_id);
    SELECT @@ROWCOUNT AS assigned;
  `);
	broadcast('update', { entity: 'topic' });
	return { assigned: result.recordset[0].assigned };
};

const unassignTopic = async (councilId, topicId, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('council_id', sql.VarChar(15), councilId)
		.input('topic_id', sql.VarChar(15), topicId).query(`
      EXEC sp_set_actor @actor_id;
      UPDATE topics SET council_id = NULL WHERE id = @topic_id AND council_id = @council_id;
    `);
	broadcast('update', { entity: 'topic' });
};

// Đặt buổi bảo vệ (sáng/chiều) cho một đề tài đã gán vào hội đồng.
const setTopicSession = async (councilId, topicId, session, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('council_id', sql.VarChar(15), councilId)
		.input('topic_id', sql.VarChar(15), topicId)
		.input('session', sql.VarChar(10), session || null).query(`
      EXEC sp_set_actor @actor_id;
      UPDATE topics SET [session] = @session
      WHERE id = @topic_id AND council_id = @council_id;
      SELECT @@ROWCOUNT AS updated;
    `);
	if (!result.recordset[0].updated) {
		throw Object.assign(new Error('Đề tài không thuộc hội đồng này.'), { status: 404 });
	}
	broadcast('update', { entity: 'topic' });
};

// Ghế thay thế theo đề tài: với một đề tài cụ thể, thay người ngồi một ghế của
// hội đồng (thành viên gốc là tác giả, hoặc cần chuyên gia đúng ngành phản biện).
const setSeatSubstitute = async (councilId, topicId, role, userId, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('council_id', sql.VarChar(15), councilId)
		.input('topic_id', sql.VarChar(15), topicId)
		.input('role', sql.VarChar(15), role)
		.input('user_id', sql.VarChar(20), userId).query(`
      EXEC sp_set_actor @actor_id;
      IF NOT EXISTS (SELECT 1 FROM topics WHERE id = @topic_id AND council_id = @council_id)
        SELECT 0 AS ok;
      ELSE
      BEGIN
        UPDATE council_seat_substitutes
        SET user_id = @user_id, created_by = @actor_id, updated_at = GETDATE(), updated_by = @actor_id
        WHERE topic_id = @topic_id AND role = @role;
        IF @@ROWCOUNT = 0
          INSERT INTO council_seat_substitutes (topic_id, role, user_id, created_by)
          VALUES (@topic_id, @role, @user_id, @actor_id);
        SELECT 1 AS ok;
      END
    `);
	if (!result.recordset[0].ok) {
		throw httpError(404, 'Đề tài không thuộc hội đồng này.');
	}
	broadcast('update', { entity: 'council' });
};

const removeSeatSubstitute = async (councilId, topicId, role, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('council_id', sql.VarChar(15), councilId)
		.input('topic_id', sql.VarChar(15), topicId)
		.input('role', sql.VarChar(15), role).query(`
      EXEC sp_set_actor @actor_id;
      DELETE s FROM council_seat_substitutes s
      INNER JOIN topics t ON t.id = s.topic_id
      WHERE s.topic_id = @topic_id AND s.role = @role AND t.council_id = @council_id;
    `);
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
