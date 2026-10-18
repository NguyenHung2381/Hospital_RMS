const { getPool, sql } = require('../../config/db');
const { broadcast } = require('../events/eventService');

const listAuthors = async (topicId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('topic_id', sql.VarChar(15), topicId)
		.query(
			'SELECT * FROM topic_authors WHERE topic_id = @topic_id ORDER BY author_order ASC, created_at ASC',
		);
	return r.recordset;
};

// Xoá hết rồi chèn lại toàn bộ danh sách tác giả theo đúng thứ tự mảng gửi lên
// (mirror trainingPlanService.setItems/surveyService.setQuestions) — đơn giản
// hơn diff từng dòng, phù hợp vì số tác giả/bài báo nhỏ.
const setAuthors = async (topicId, authors, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('topic_id', sql.VarChar(15), topicId)
		.query('DELETE FROM topic_authors WHERE topic_id = @topic_id');
	let order = 0;
	for (const a of authors || []) {
		if (!a || !a.author_name) continue;
		await pool
			.request()
			.input('topic_id', sql.VarChar(15), topicId)
			.input('author_name', sql.NVarChar(255), a.author_name)
			.input('affiliation', sql.NVarChar(255), a.affiliation || null)
			.input('author_order', sql.Int, order)
			.input('is_corresponding', sql.Bit, a.is_corresponding ? 1 : 0)
			.input('actor_id', sql.VarChar(20), actorId).query(`
        DECLARE @new_id VARCHAR(20) = 'TG' + LEFT(REPLACE(NEWID(),'-',''), 18);
        INSERT INTO topic_authors (id, topic_id, author_name, affiliation, author_order, is_corresponding, created_by)
        VALUES (@new_id, @topic_id, @author_name, @affiliation, @author_order, @is_corresponding, @actor_id);
      `);
		order += 1;
	}
	broadcast('update', { entity: 'topic_author' });
	return listAuthors(topicId);
};

module.exports = { listAuthors, setAuthors };
