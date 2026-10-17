const { getPool, sql } = require('../../config/db');
const { parseJsonArray } = require('../../utils/sqlFilters');
const { broadcast } = require('../events/eventService');
const { paging } = require('../../utils/paging');

const QUESTION_TYPES = ['single_choice', 'multi_choice', 'text'];

const surveySelect = `
  SELECT s.*, r.name AS target_role_name,
         (SELECT COUNT(*) FROM survey_questions q WHERE q.survey_id = s.id) AS question_count,
         (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count
  FROM surveys s
  LEFT JOIN roles r ON r.id = s.target_role
`;

const parseOptions = (row) => (row.options === undefined ? row : { ...row, options: parseJsonArray(row.options) });

// ─── Quản trị (admin) ────────────────────────────────────────────────────────
const getAll = async ({ page = 1, limit = 20, search, status } = {}) => {
	const pool = await getPool();
	const pg = paging(page, limit, 100);
	const where = ['1=1'];
	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);

	if (search) {
		where.push('(s.title LIKE @search OR s.description LIKE @search)');
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	if (status) {
		where.push('s.status = @status');
		req.input('status', sql.VarChar(20), status);
	}
	const whereSql = `WHERE ${where.join(' AND ')}`;

	const result = await req.query(`
    ${surveySelect} ${whereSql} ORDER BY s.created_at DESC
    ${pg.fetchClause};
    SELECT COUNT(*) AS total FROM surveys s ${whereSql};
  `);
	return {
		data: result.recordsets[0],
		pagination: { page: pg.page, limit: pg.limit, total: result.recordsets[1][0].total },
	};
};

const listQuestions = async (surveyId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('survey_id', sql.VarChar(20), surveyId)
		.query('SELECT * FROM survey_questions WHERE survey_id = @survey_id ORDER BY sort_order ASC, created_at ASC');
	return r.recordset.map(parseOptions);
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(20), id).query(`${surveySelect} WHERE s.id = @id`);
	const row = result.recordset[0];
	if (!row) return null;
	row.questions = await listQuestions(id);
	return row;
};

const setQuestions = async (surveyId, questions, actorId) => {
	const pool = await getPool();
	await pool.request().input('survey_id', sql.VarChar(20), surveyId).query('DELETE FROM survey_questions WHERE survey_id = @survey_id');
	let order = 0;
	for (const q of questions || []) {
		if (!q || !q.question_text || !QUESTION_TYPES.includes(q.question_type)) continue;
		const options = q.question_type === 'text' ? null : JSON.stringify((q.options || []).filter(Boolean));
		await pool
			.request()
			.input('survey_id', sql.VarChar(20), surveyId)
			.input('question_text', sql.NVarChar(500), q.question_text)
			.input('question_type', sql.VarChar(20), q.question_type)
			.input('options', sql.NVarChar(sql.MAX), options)
			.input('actor_id', sql.VarChar(20), actorId || null)
			.input('sort_order', sql.Int, order).query(`
        DECLARE @new_id VARCHAR(20) = 'CH' + LEFT(REPLACE(NEWID(),'-',''), 18);
        INSERT INTO survey_questions (id, survey_id, question_text, question_type, options, sort_order, created_by)
        VALUES (@new_id, @survey_id, @question_text, @question_type, @options, @sort_order, @actor_id);
      `);
		order += 1;
	}
	broadcast('update', { entity: 'survey' });
	return listQuestions(surveyId);
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('title', sql.NVarChar(255), data.title)
		.input('description', sql.NVarChar(sql.MAX), data.description || null)
		.input('status', sql.VarChar(20), data.status || 'draft')
		.input('target_role', sql.VarChar(20), data.target_role || null)
		.query(`
      DECLARE @new_id VARCHAR(20) = 'KS' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO surveys (id, title, description, status, target_role, created_by)
      VALUES (@new_id, @title, @description, @status, @target_role, @actor_id);
      SELECT @new_id AS id;
    `);
	const id = result.recordset[0].id;
	if (Array.isArray(data.questions) && data.questions.length) await setQuestions(id, data.questions, actorId);
	broadcast('update', { entity: 'survey' });
	return getById(id);
};

const update = async (id, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool.request().input('id', sql.VarChar(20), id).input('actor_id', sql.VarChar(20), actorId);

	if (data.title !== undefined) {
		sets.push('title = @title');
		req.input('title', sql.NVarChar(255), data.title);
	}
	if (data.description !== undefined) {
		sets.push('description = @description');
		req.input('description', sql.NVarChar(sql.MAX), data.description || null);
	}
	if (data.status !== undefined) {
		sets.push('status = @status');
		req.input('status', sql.VarChar(20), data.status);
	}
	if (data.target_role !== undefined) {
		sets.push('target_role = @target_role');
		req.input('target_role', sql.VarChar(20), data.target_role || null);
	}

	if (sets.length > 2) await req.query(`UPDATE surveys SET ${sets.join(', ')} WHERE id = @id`);
	if (Array.isArray(data.questions)) await setQuestions(id, data.questions, actorId);
	broadcast('update', { entity: 'survey' });
	return getById(id);
};

const remove = async (id) => {
	const pool = await getPool();
	await pool.request().input('id', sql.VarChar(20), id).query('DELETE FROM surveys WHERE id = @id');
	broadcast('update', { entity: 'survey' });
};

// Kết quả tổng hợp: câu chọn 1/nhiều -> đếm theo từng lựa chọn; câu tự luận ->
// danh sách câu trả lời thô (không có "đếm" ý nghĩa cho văn bản tự do).
const getResults = async (surveyId) => {
	const survey = await getById(surveyId);
	if (!survey) return null;
	const pool = await getPool();
	const answersRes = await pool.request().input('survey_id', sql.VarChar(20), surveyId).query(`
    SELECT a.question_id, a.answer_text, a.answer_options
    FROM survey_answers a
    JOIN survey_responses r ON r.id = a.response_id
    WHERE r.survey_id = @survey_id
  `);
	const answers = answersRes.recordset;

	const questions = survey.questions.map((q) => {
		const qAnswers = answers.filter((a) => a.question_id === q.id);
		if (q.question_type === 'text') {
			return {
				...q,
				texts: qAnswers.map((a) => a.answer_text).filter(Boolean),
			};
		}
		const counts = {};
		(q.options || []).forEach((opt) => {
			counts[opt] = 0;
		});
		qAnswers.forEach((a) => {
			parseJsonArray(a.answer_options).forEach((opt) => {
				counts[opt] = (counts[opt] || 0) + 1;
			});
		});
		return {
			...q,
			counts: Object.entries(counts).map(([option, count]) => ({ option, count })),
		};
	});

	return { ...survey, questions, response_count: survey.response_count };
};

// ─── Người dùng nộp khảo sát ─────────────────────────────────────────────────
// Khảo sát đang mở, dành cho vai trò của actor (hoặc mở cho tất cả nếu
// target_role NULL), VÀ actor chưa từng nộp — UNIQUE(survey_id, respondent)
// nên chỉ cần LEFT JOIN loại bỏ những gì đã có response.
const listActiveForUser = async (actor) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('role_id', sql.VarChar(20), actor.role_id || null)
		.input('user_id', sql.VarChar(20), actor.id)
		.query(`
      SELECT s.id, s.title, s.description, s.created_at
      FROM surveys s
      WHERE s.status = 'active'
        AND (s.target_role IS NULL OR s.target_role = @role_id)
        AND NOT EXISTS (
          SELECT 1 FROM survey_responses sr WHERE sr.survey_id = s.id AND sr.respondent_user_id = @user_id
        )
      ORDER BY s.created_at DESC
    `);
	return r.recordset;
};

const getForRespond = async (id, actor) => {
	const pool = await getPool();
	const survey = await pool.request().input('id', sql.VarChar(20), id).query(`
    SELECT id, title, description, status, target_role FROM surveys WHERE id = @id
  `);
	const row = survey.recordset[0];
	if (!row) return null;
	if (row.status !== 'active') {
		const err = new Error('Khảo sát này hiện không mở nhận phản hồi.');
		err.statusCode = 403;
		throw err;
	}
	if (row.target_role && row.target_role !== actor.role_id) {
		const err = new Error('Khảo sát này không dành cho vai trò của bạn.');
		err.statusCode = 403;
		throw err;
	}
	const existing = await pool
		.request()
		.input('survey_id', sql.VarChar(20), id)
		.input('user_id', sql.VarChar(20), actor.id)
		.query('SELECT id FROM survey_responses WHERE survey_id = @survey_id AND respondent_user_id = @user_id');
	if (existing.recordset[0]) {
		const err = new Error('Bạn đã nộp khảo sát này rồi.');
		err.statusCode = 409;
		throw err;
	}
	row.questions = await listQuestions(id);
	return row;
};

const submitResponse = async (surveyId, answers, actor) => {
	// Validate lại toàn bộ điều kiện (trạng thái/vai trò/đã nộp chưa) ngay
	// trước khi ghi — tránh race giữa lúc mở form và lúc bấm nộp.
	const survey = await getForRespond(surveyId, actor);
	const questionMap = new Map(survey.questions.map((q) => [q.id, q]));

	const pool = await getPool();
	const responseResult = await pool
		.request()
		.input('survey_id', sql.VarChar(20), surveyId)
		.input('user_id', sql.VarChar(20), actor.id)
		.query(`
      DECLARE @new_id VARCHAR(20) = 'PH' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO survey_responses (id, survey_id, respondent_user_id, created_by)
      VALUES (@new_id, @survey_id, @user_id, @user_id);
      SELECT @new_id AS id;
    `)
		.catch((err) => {
			if (err.number === 2627 || err.number === 2601) {
				const e = new Error('Bạn đã nộp khảo sát này rồi.');
				e.statusCode = 409;
				throw e;
			}
			throw err;
		});
	const responseId = responseResult.recordset[0].id;

	for (const [questionId, question] of questionMap) {
		const ans = (answers || []).find((a) => a.question_id === questionId);
		const isText = question.question_type === 'text';
		await pool
			.request()
			.input('response_id', sql.VarChar(20), responseId)
			.input('question_id', sql.VarChar(20), questionId)
			.input('answer_text', sql.NVarChar(sql.MAX), isText ? ans?.answer_text || null : null)
			.input(
				'answer_options',
				sql.NVarChar(sql.MAX),
				!isText && ans?.answer_options ? JSON.stringify(ans.answer_options) : null,
			).query(`
        DECLARE @new_id VARCHAR(20) = 'DA' + LEFT(REPLACE(NEWID(),'-',''), 18);
        INSERT INTO survey_answers (id, response_id, question_id, answer_text, answer_options)
        VALUES (@new_id, @response_id, @question_id, @answer_text, @answer_options);
      `);
	}
	broadcast('update', { entity: 'survey' });
	return { response_id: responseId };
};

module.exports = {
	getAll,
	getById,
	create,
	update,
	remove,
	setQuestions,
	getResults,
	listActiveForUser,
	getForRespond,
	submitResponse,
};
