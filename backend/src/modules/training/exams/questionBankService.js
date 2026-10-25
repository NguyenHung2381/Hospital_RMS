const { getPool, sql, withTransaction } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { removeUploadedFile, toStoredUploadPath } = require('../../../utils/uploadPaths');
const { httpError } = require('../../../utils/httpError');
const { QUESTION_TYPES, POOLS, parseOptions } = require('./examShared');

// Ảnh minh họa câu hỏi — tải lên qua POST /exams/questions/image (modules/training/exams/exams.routes.js)
const QUESTION_IMAGE_DIR = '/uploads/questions/';
const imagePath = (url) => toStoredUploadPath(url, QUESTION_IMAGE_DIR);

// ─── Ngân hàng câu hỏi ───────────────────────────────────────────────────────
// program_id = '__none__' ⇒ câu chưa thuộc chương trình nào (câu cũ chưa gắn bài học).
const listQuestions = async ({
	program_id = undefined,
	pool: questionPool = undefined,
	search = undefined,
	question_type = undefined,
} = {}) => {
	const pool = await getPool();
	const where = ['1=1'];
	const req = pool.request();
	if (program_id === '__none__') where.push('q.program_id IS NULL');
	else if (program_id) {
		where.push('q.program_id = @program_id');
		req.input('program_id', sql.VarChar(20), program_id);
	}
	if (POOLS.includes(questionPool)) {
		where.push('q.pool = @qpool');
		req.input('qpool', sql.VarChar(10), questionPool);
	}
	if (question_type) {
		where.push('q.question_type = @question_type');
		req.input('question_type', sql.VarChar(20), question_type);
	}
	if (search) {
		where.push('q.question_text LIKE @search');
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	const r = await req.query(`
    SELECT q.*, s.title AS subject_name, tp.code AS program_code, tp.name AS program_name,
           (SELECT COUNT(DISTINCT epq.paper_id) FROM exam_paper_questions epq WHERE epq.question_id = q.id) AS used_count
    FROM question_bank q
    LEFT JOIN program_lessons s ON s.id = q.subject_id
    LEFT JOIN training_programs tp ON tp.id = q.program_id
    WHERE ${where.join(' AND ')}
    ORDER BY q.created_at DESC
  `);
	return r.recordset.map(parseOptions);
};

const removeImageIfUnused = async (path) => {
	if (!path) return;
	const pool = await getPool();
	const used = (
		await pool
			.request()
			.input('path', sql.NVarChar(500), path)
			.query('SELECT COUNT(*) AS n FROM question_bank WHERE image_url = @path')
	).recordset[0].n;
	if (!used) removeUploadedFile(path);
};

const getQuestion = async (id) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query('SELECT * FROM question_bank WHERE id = @id');
	return r.recordset[0] ? parseOptions(r.recordset[0]) : null;
};

// request: pool.request() hoặc transaction.request() — dùng chung cho tạo lẻ và nhập hàng loạt
const insertQuestion = async (request, data, actorId) => {
	const type = QUESTION_TYPES.includes(data.question_type) ? data.question_type : 'single_choice';
	const result = await request
		.input('subject_id', sql.VarChar(20), data.subject_id || null)
		.input('program_id', sql.VarChar(20), data.program_id || null)
		.input('qpool', sql.VarChar(10), POOLS.includes(data.pool) ? data.pool : 'final')
		.input('question_type', sql.VarChar(20), type)
		.input('question_text', sql.NVarChar(sql.MAX), data.question_text)
		.input(
			'options',
			sql.NVarChar(sql.MAX),
			type === 'essay' ? null : JSON.stringify((data.options || []).filter(Boolean)),
		)
		.input(
			'correct_option',
			sql.NVarChar(255),
			type === 'essay' ? null : data.correct_option || null,
		)
		.input('points', sql.Decimal(4, 1), data.points || 1)
		.input('image_url', sql.NVarChar(500), imagePath(data.image_url))
		.input('actor_id', sql.VarChar(20), actorId).query(`
      DECLARE @new_id VARCHAR(20) = 'QB' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO question_bank (id, subject_id, program_id, pool, question_type, question_text, options, correct_option, points, image_url, created_by)
      VALUES (@new_id, @subject_id, @program_id, @qpool, @question_type, @question_text, @options, @correct_option, @points, @image_url, @actor_id);
      SELECT @new_id AS id;
    `);
	return result.recordset[0].id;
};

const createQuestion = async (data, actorId) => {
	const pool = await getPool();
	const id = await insertQuestion(pool.request(), data, actorId);
	broadcast('update', { entity: 'question_bank' });
	return getQuestion(id);
};

// Nhập hàng loạt (từ file Word/PDF đã tách câu ở trình duyệt) — tất cả hoặc không
const createQuestionsBulk = async (items, actorId) => {
	const ids = [];
	await withTransaction(async (tx) => {
		for (const item of items) ids.push(await insertQuestion(tx.request(), item, actorId));
	});
	broadcast('update', { entity: 'question_bank' });
	// ids theo đúng thứ tự gửi lên — form đề thi dùng để thêm ngay các câu vừa nhập vào đề
	return { created: items.length, ids };
};

const updateQuestion = async (id, data, actorId) => {
	const pool = await getPool();
	const current = await getQuestion(id);
	if (!current) return null;
	const type =
		data.question_type && QUESTION_TYPES.includes(data.question_type)
			? data.question_type
			: current.question_type;
	const sets = [
		'updated_at = GETDATE()',
		'updated_by = @actor_id',
		'question_type = @question_type',
	];
	const req = pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId)
		.input('question_type', sql.VarChar(20), type);

	if (data.subject_id !== undefined) {
		sets.push('subject_id = @subject_id');
		req.input('subject_id', sql.VarChar(20), data.subject_id || null);
	}
	if (data.program_id !== undefined) {
		sets.push('program_id = @program_id');
		req.input('program_id', sql.VarChar(20), data.program_id || null);
	}
	if (POOLS.includes(data.pool)) {
		sets.push('pool = @qpool');
		req.input('qpool', sql.VarChar(10), data.pool);
	}
	if (data.question_text !== undefined) {
		sets.push('question_text = @question_text');
		req.input('question_text', sql.NVarChar(sql.MAX), data.question_text);
	}
	if (data.options !== undefined || data.question_type !== undefined) {
		sets.push('options = @options');
		req.input(
			'options',
			sql.NVarChar(sql.MAX),
			type === 'essay'
				? null
				: JSON.stringify((data.options ?? current.options ?? []).filter(Boolean)),
		);
	}
	if (data.correct_option !== undefined || data.question_type !== undefined) {
		sets.push('correct_option = @correct_option');
		req.input(
			'correct_option',
			sql.NVarChar(255),
			type === 'essay' ? null : (data.correct_option ?? current.correct_option ?? null),
		);
	}
	if (data.points !== undefined) {
		sets.push('points = @points');
		req.input('points', sql.Decimal(4, 1), data.points);
	}
	const newImage = data.image_url !== undefined ? imagePath(data.image_url) : current.image_url;
	if (data.image_url !== undefined) {
		sets.push('image_url = @image_url');
		req.input('image_url', sql.NVarChar(500), newImage);
	}

	await req.query(`UPDATE question_bank SET ${sets.join(', ')} WHERE id = @id`);
	// Đổi / bỏ ảnh → xóa file ảnh cũ nếu không câu nào khác dùng (câu chép sang chương trình khác dùng chung ảnh)
	if (current.image_url && current.image_url !== newImage)
		await removeImageIfUnused(current.image_url);
	broadcast('update', { entity: 'question_bank' });
	return getQuestion(id);
};

const removeQuestion = async (id) => {
	const pool = await getPool();
	// FK exam_paper_questions/exam_answers không cascade — báo rõ thay vì lỗi SQL 547
	const r = await pool.request().input('id', sql.VarChar(20), id).query(`
    IF EXISTS (SELECT 1 FROM exam_paper_questions WHERE question_id = @id)
       OR EXISTS (SELECT 1 FROM exam_answers WHERE question_id = @id)
      SELECT 1 AS in_use
    ELSE
      DELETE FROM question_bank OUTPUT DELETED.image_url WHERE id = @id;
  `);
	if (r.recordset?.[0]?.in_use) {
		throw httpError(
			409,
			'Câu hỏi đang được dùng trong đề thi, không thể xóa. Hãy bỏ câu hỏi khỏi các đề trước.',
		);
	}
	await removeImageIfUnused(r.recordset?.[0]?.image_url);
	broadcast('update', { entity: 'question_bank' });
};

module.exports = {
	listQuestions,
	getQuestion,
	createQuestion,
	createQuestionsBulk,
	updateQuestion,
	removeQuestion,
};
