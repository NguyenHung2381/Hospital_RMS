const { getPool, sql, withTransaction } = require('../../../config/db');
const { parseJsonArray } = require('../../../utils/sqlFilters');
const { broadcast } = require('../../events/eventService');
const gradebookService = require('../courses/gradebookService');
const { toTen } = require('../courses/gradeRules');
const { removeUploadedFile, toStoredUploadPath } = require('../../../utils/uploadPaths');
const { randomUUID } = require('crypto');
const { httpError } = require('../../../utils/httpError');
const { seededRandom, shuffle, drawQuestions, theoryScore } = require('./examGen');

const QUESTION_TYPES = ['single_choice', 'essay'];
// Mỗi chương trình 1 ngân hàng, chia 2 kho: kiểm tra đầu vào / thi cuối khóa (2026-11-27_exam_bank_programs)
const POOLS = ['entrance', 'final'];
const CODE_MODES = ['per_trainee', 'shuffled', 'codes'];
// Loại đề → loại câu hỏi được phép đưa vào. paper_type NULL = đề hỗn hợp TN + TL
// (đầu vào hoặc cuối khóa, và đề cũ tạo trước khi có cột này) — không lọc.
const PAPER_QUESTION_TYPE = { multiple_choice: 'single_choice', essay: 'essay' };

const parseOptions = (row) =>
	row.options === undefined ? row : { ...row, options: parseJsonArray(row.options) };

// Ảnh minh hoạ câu hỏi — tải lên qua POST /exams/questions/image (modules/training/exams/exams.routes.js)
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
	// Đổi / bỏ ảnh → xoá file ảnh cũ nếu không câu nào khác dùng (câu chép sang chương trình khác dùng chung ảnh)
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
			'Câu hỏi đang được dùng trong đề thi, không thể xoá. Hãy bỏ câu hỏi khỏi các đề trước.',
		);
	}
	await removeImageIfUnused(r.recordset?.[0]?.image_url);
	broadcast('update', { entity: 'question_bank' });
};

// ─── Đề thi ──────────────────────────────────────────────────────────────────
const paperSelect = `
  SELECT p.*, c.name AS course_name, s.title AS subject_name, tp.code AS program_code, tp.name AS program_name,
         (SELECT COUNT(*) FROM exam_paper_questions epq WHERE epq.paper_id = p.id AND ISNULL(epq.code_no, 1) = 1) AS question_count,
         (SELECT COUNT(*) FROM exam_attempts a WHERE a.paper_id = p.id) AS attempt_count,
         (SELECT STRING_AGG(g.lecturer_id, ',') FROM exam_paper_graders g WHERE g.paper_id = p.id) AS grader_ids,
         (SELECT STRING_AGG(l.full_name, ', ') FROM exam_paper_graders g JOIN lecturers l ON l.id = g.lecturer_id
          WHERE g.paper_id = p.id) AS grader_names
  FROM exam_papers p
  JOIN courses c ON c.id = p.course_id
  LEFT JOIN program_lessons s ON s.id = p.subject_id
  LEFT JOIN training_programs tp ON tp.id = p.program_id
`;

const withGraders = (row) => ({
	...row,
	grader_ids: row.grader_ids ? row.grader_ids.split(',') : [],
	weight: row.weight == null ? null : Number(row.weight),
});

const isRandom = (p) => (p.gen_mc_count ?? 0) + (p.gen_essay_count ?? 0) > 0;

const listPapers = async (courseId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('course_id', sql.VarChar(20), courseId)
		.query(`${paperSelect} WHERE p.course_id = @course_id ORDER BY p.purpose, p.created_at DESC`);
	return r.recordset.map(withGraders);
};

// Câu hỏi trong đề — bản ĐẦY ĐỦ (có correct_option/points), chỉ dùng cho màn
// quản trị (tạo/sửa đề, xem lại). Bản cho học viên làm bài PHẢI qua
// startAttempt (ẩn correct_option). Đề nhiều mã: code_no = mã đề.
const listPaperQuestionsFull = async (paperId) => {
	const pool = await getPool();
	const r = await pool.request().input('paper_id', sql.VarChar(20), paperId).query(`
    SELECT epq.id AS link_id, epq.sort_order, epq.code_no, q.*
    FROM exam_paper_questions epq
    JOIN question_bank q ON q.id = epq.question_id
    WHERE epq.paper_id = @paper_id
    ORDER BY ISNULL(epq.code_no, 0), epq.sort_order ASC
  `);
	return r.recordset.map(parseOptions);
};

const getPaper = async (id) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query(`${paperSelect} WHERE p.id = @id`);
	const row = r.recordset[0];
	if (!row) return null;
	row.questions = await listPaperQuestionsFull(id);
	return withGraders(row);
};

// Người chấm của đề (GV). Danh sách rỗng = mặc định GV được phân công bài học của đề.
const setPaperGraders = async (paperId, lecturerIds, actorId) => {
	const ids = [...new Set((lecturerIds || []).filter(Boolean))];
	await withTransaction(async (tx) => {
		await new sql.Request(tx)
			.input('paper_id', sql.VarChar(20), paperId)
			.query('DELETE FROM exam_paper_graders WHERE paper_id = @paper_id');
		for (const lecturerId of ids)
			await new sql.Request(tx)
				.input('paper_id', sql.VarChar(20), paperId)
				.input('lecturer_id', sql.VarChar(20), lecturerId)
				.input('actor_id', sql.VarChar(20), actorId || null).query(`
          INSERT INTO exam_paper_graders (paper_id, lecturer_id, created_by)
          SELECT @paper_id, id, @actor_id FROM lecturers WHERE id = @lecturer_id
        `);
	});
};

const insertPaperQuestions = async (paperId, ids, codeNo, actorId, onlyType = null) => {
	const pool = await getPool();
	for (let i = 0; i < ids.length; i++) {
		await pool
			.request()
			.input('paper_id', sql.VarChar(20), paperId)
			.input('question_id', sql.VarChar(20), ids[i])
			.input('only_type', sql.VarChar(20), onlyType)
			.input('code_no', sql.Int, codeNo)
			.input('actor_id', sql.VarChar(20), actorId || null)
			.input('sort_order', sql.Int, i).query(`
        IF EXISTS (SELECT 1 FROM question_bank WHERE id = @question_id AND (@only_type IS NULL OR question_type = @only_type))
        BEGIN
          DECLARE @new_id VARCHAR(20) = 'EPQ' + LEFT(REPLACE(NEWID(),'-',''), 17);
          INSERT INTO exam_paper_questions (id, paper_id, question_id, sort_order, code_no, created_by)
          VALUES (@new_id, @paper_id, @question_id, @sort_order, @code_no, @actor_id);
        END
      `);
	}
};

// Đề chọn câu tay
const setPaperQuestions = async (paperId, questionIds, actorId) => {
	const pool = await getPool();
	const paperType = (
		await pool
			.request()
			.input('id', sql.VarChar(20), paperId)
			.query('SELECT paper_type FROM exam_papers WHERE id = @id')
	).recordset[0]?.paper_type;
	await pool
		.request()
		.input('paper_id', sql.VarChar(20), paperId)
		.query('DELETE FROM exam_paper_questions WHERE paper_id = @paper_id');
	const ids = [...new Set((questionIds || []).filter(Boolean))];
	await insertPaperQuestions(paperId, ids, null, actorId, PAPER_QUESTION_TYPE[paperType] || null);
	broadcast('update', { entity: 'exam_paper' });
	return listPaperQuestionsFull(paperId);
};

// ─── Sinh đề ngẫu nhiên từ ngân hàng của chương trình ───────────────────────
const bankOf = async (paper) => {
	const pool = await getPool();
	const rows = (
		await pool
			.request()
			.input('program_id', sql.VarChar(20), paper.program_id)
			.input('qpool', sql.VarChar(10), paper.purpose)
			.query(
				'SELECT id, question_type FROM question_bank WHERE program_id = @program_id AND pool = @qpool',
			)
	).recordset;
	return {
		mc: rows.filter((q) => q.question_type === 'single_choice').map((q) => q.id),
		essay: rows.filter((q) => q.question_type === 'essay').map((q) => q.id),
	};
};

const POOL_LABEL = { entrance: 'kiểm tra đầu vào', final: 'thi cuối khóa' };
/** Bốc câu cho 1 bộ đề: trắc nghiệm trước, tự luận sau. Không đủ câu ⇒ lỗi 400. */
const drawSet = (paper, bank, seen, rand) => {
	const mc = drawQuestions(bank.mc, paper.gen_mc_count ?? 0, seen, rand);
	const essay = drawQuestions(bank.essay, paper.gen_essay_count ?? 0, seen, rand);
	const short = [
		mc == null && `${bank.mc.length}/${paper.gen_mc_count} câu trắc nghiệm`,
		essay == null && `${bank.essay.length}/${paper.gen_essay_count} câu tự luận`,
	].filter(Boolean);
	if (short.length)
		throw httpError(
			400,
			`Ngân hàng ${POOL_LABEL[paper.purpose]} của chương trình chưa đủ câu: mới có ${short.join(', ')}.`,
		);
	return [...mc, ...essay];
};

// Đề chung (shuffled) / nhiều mã đề (codes): bốc sẵn khi lưu đề. Mỗi HV 1 đề (per_trainee):
// bốc lúc bắt đầu làm — ở đây chỉ kiểm tra ngân hàng đủ câu.
const generatePaperQuestions = async (paperId, actorId) => {
	const pool = await getPool();
	const paper = (
		await pool
			.request()
			.input('id', sql.VarChar(20), paperId)
			.query('SELECT * FROM exam_papers WHERE id = @id')
	).recordset[0];
	await pool
		.request()
		.input('paper_id', sql.VarChar(20), paperId)
		.query('DELETE FROM exam_paper_questions WHERE paper_id = @paper_id');
	const bank = await bankOf(paper);
	const rand = seededRandom(`${paperId}:${Date.now()}`);
	if (paper.code_mode === 'per_trainee') {
		drawSet(paper, bank, new Set(), rand);
		return;
	}
	const codes = paper.code_mode === 'codes' ? Math.max(1, paper.code_count || 2) : 1;
	const used = new Set();
	for (let k = 1; k <= codes; k++) {
		const ids = drawSet(paper, bank, used, rand); // các mã đề khác nhau nhiều nhất có thể
		ids.forEach((id) => used.add(id));
		await insertPaperQuestions(paperId, ids, paper.code_mode === 'codes' ? k : null, actorId);
	}
};

const GEN_FIELDS = [
	'program_id',
	'purpose',
	'paper_type',
	'gen_mc_count',
	'gen_essay_count',
	'code_mode',
	'code_count',
];

const normPaper = (data) => {
	const random = (Number(data.gen_mc_count) || 0) + (Number(data.gen_essay_count) || 0) > 0;
	if (random && !data.program_id)
		throw httpError(400, 'Đề ngẫu nhiên cần chọn lớp (chương trình) để lấy ngân hàng câu hỏi.');
	return {
		random,
		code_mode: random
			? CODE_MODES.includes(data.code_mode)
				? data.code_mode
				: 'per_trainee'
			: null,
	};
};

const createPaper = async (data, actorId) => {
	const { random, code_mode } = normPaper(data);
	const pool = await getPool();
	const result = await pool
		.request()
		.input('course_id', sql.VarChar(20), data.course_id)
		.input('subject_id', sql.VarChar(20), data.subject_id || null)
		.input('title', sql.NVarChar(255), data.title)
		// Đề hỗn hợp TN + TL: paper_type NULL
		.input(
			'paper_type',
			sql.VarChar(20),
			data.paper_type === null ? null : data.paper_type || 'multiple_choice',
		)
		.input('duration_minutes', sql.Int, data.duration_minutes || 45)
		.input('status', sql.VarChar(20), data.status || 'draft')
		.input('exam_part', sql.VarChar(10), data.exam_part || 'theory')
		.input('blind_grading', sql.Bit, data.blind_grading ? 1 : 0)
		.input('purpose', sql.VarChar(10), POOLS.includes(data.purpose) ? data.purpose : 'final')
		.input('program_id', sql.VarChar(20), data.program_id || null)
		.input('gen_mc_count', sql.Int, random ? Number(data.gen_mc_count) || 0 : null)
		.input('gen_essay_count', sql.Int, random ? Number(data.gen_essay_count) || 0 : null)
		.input('code_mode', sql.VarChar(12), code_mode)
		.input(
			'code_count',
			sql.Int,
			code_mode === 'codes' ? Math.max(2, Number(data.code_count) || 2) : null,
		)
		.input(
			'weight',
			sql.Decimal(5, 2),
			data.weight === '' || data.weight == null ? null : Number(data.weight),
		)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      DECLARE @new_id VARCHAR(20) = 'EP' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO exam_papers (id, course_id, subject_id, title, paper_type, duration_minutes, status, exam_part, blind_grading,
                               purpose, program_id, gen_mc_count, gen_essay_count, code_mode, code_count, weight, created_by)
      VALUES (@new_id, @course_id, @subject_id, @title, @paper_type, @duration_minutes, @status, @exam_part, @blind_grading,
              @purpose, @program_id, @gen_mc_count, @gen_essay_count, @code_mode, @code_count, @weight, @actor_id);
      SELECT @new_id AS id;
    `);
	const id = result.recordset[0].id;
	try {
		if (random) await generatePaperQuestions(id, actorId);
		else if (Array.isArray(data.question_ids) && data.question_ids.length)
			await setPaperQuestions(id, data.question_ids, actorId);
	} catch (err) {
		// Ngân hàng không đủ câu ⇒ không để lại đề rỗng
		await pool
			.request()
			.input('id', sql.VarChar(20), id)
			.query('DELETE FROM exam_papers WHERE id = @id');
		throw err;
	}
	if (Array.isArray(data.grader_ids)) await setPaperGraders(id, data.grader_ids, actorId);
	broadcast('update', { entity: 'exam_paper' });
	return getPaper(id);
};

// data.regenerate = true ⇒ bốc lại câu (đề chung / nhiều mã), chỉ khi chưa ai làm bài.
const updatePaper = async (id, data, actorId) => {
	const current = await getPaper(id);
	if (!current) return null;
	const merged = { ...current, ...data };
	const { random, code_mode } = normPaper(merged);
	const genChanged =
		GEN_FIELDS.some(
			(f) => data[f] !== undefined && String(data[f] ?? '') !== String(current[f] ?? ''),
		) ||
		(random && !!data.regenerate);
	if (genChanged && current.attempt_count > 0)
		throw httpError(
			409,
			'Đề đã có bài làm — không đổi cách ra đề / bốc lại câu được. Hãy tạo đề mới.',
		);

	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId);
	const fields = {
		subject_id: sql.VarChar(20),
		title: sql.NVarChar(255),
		duration_minutes: sql.Int,
		status: sql.VarChar(20),
		paper_type: sql.VarChar(20),
		exam_part: sql.VarChar(10),
		purpose: sql.VarChar(10),
		program_id: sql.VarChar(20),
		weight: sql.Decimal(5, 2),
	};
	for (const [f, type] of Object.entries(fields)) {
		if (data[f] === undefined) continue;
		sets.push(`${f} = @${f}`);
		req.input(f, type, data[f] === '' ? null : data[f]);
	}
	if (data.blind_grading !== undefined) {
		sets.push('blind_grading = @blind_grading');
		req.input('blind_grading', sql.Bit, data.blind_grading ? 1 : 0);
	}
	sets.push(
		'gen_mc_count = @gen_mc_count',
		'gen_essay_count = @gen_essay_count',
		'code_mode = @code_mode',
		'code_count = @code_count',
	);
	req
		.input('gen_mc_count', sql.Int, random ? Number(merged.gen_mc_count) || 0 : null)
		.input('gen_essay_count', sql.Int, random ? Number(merged.gen_essay_count) || 0 : null)
		.input('code_mode', sql.VarChar(12), code_mode)
		.input(
			'code_count',
			sql.Int,
			code_mode === 'codes' ? Math.max(2, Number(merged.code_count) || 2) : null,
		);
	await req.query(`UPDATE exam_papers SET ${sets.join(', ')} WHERE id = @id`);

	if (random) {
		if (genChanged || !isRandom(current)) await generatePaperQuestions(id, actorId);
	} else if (isRandom(current)) {
		// Chuyển từ ngẫu nhiên sang chọn tay
		await setPaperQuestions(id, Array.isArray(data.question_ids) ? data.question_ids : [], actorId);
	} else {
		// Đổi loại đề mà không gửi danh sách câu → lọc lại câu hiện có theo loại mới
		const questionIds = Array.isArray(data.question_ids)
			? data.question_ids
			: data.paper_type !== undefined
				? (current.questions ?? []).map((q) => q.id)
				: null;
		if (questionIds) await setPaperQuestions(id, questionIds, actorId);
	}
	if (Array.isArray(data.grader_ids)) await setPaperGraders(id, data.grader_ids, actorId);
	broadcast('update', { entity: 'exam_paper' });
	return getPaper(id);
};

const removePaper = async (id) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query('DELETE FROM exam_papers WHERE id = @id');
	broadcast('update', { entity: 'exam_paper' });
};

// ─── Bộ câu của 1 lượt làm bài ──────────────────────────────────────────────
// Lượt mới lưu sẵn question_ids (thứ tự riêng); lượt cũ (trước 2026-11-27) dùng câu của đề.
const attemptQuestionIds = async (attempt) => {
	if (attempt.question_ids) return JSON.parse(attempt.question_ids);
	const pool = await getPool();
	return (
		await pool
			.request()
			.input('paper_id', sql.VarChar(20), attempt.paper_id)
			.query(
				'SELECT question_id FROM exam_paper_questions WHERE paper_id = @paper_id ORDER BY sort_order',
			)
	).recordset.map((r) => r.question_id);
};

const loadQuestions = async (ids, columns) => {
	if (!ids.length) return [];
	const pool = await getPool();
	const rows = (
		await pool
			.request()
			.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
			.query(
				`SELECT ${columns} FROM question_bank q WHERE q.id IN (SELECT [value] FROM OPENJSON(@ids))`,
			)
	).recordset;
	const byId = new Map(rows.map((r) => [r.id, r]));
	return ids.map((id, i) => byId.get(id) && { ...byId.get(id), sort_order: i }).filter(Boolean);
};

// ─── Chấm bài (tự luận) ──────────────────────────────────────────────────────
const listAttempts = async (paperId) => {
	const pool = await getPool();
	const r = await pool.request().input('paper_id', sql.VarChar(20), paperId).query(`
    SELECT a.id, a.paper_id, a.enrollment_id, a.started_at, a.submitted_at, a.auto_score, a.manual_score, a.status,
           a.attempt_no, a.code_no, a.score10, t.full_name AS trainee_name,
           (SELECT COUNT(*) FROM exam_answers ea WHERE ea.attempt_id = a.id AND ea.score_awarded IS NULL) AS pending_count
    FROM exam_attempts a
    JOIN course_enrollments e ON e.id = a.enrollment_id
    JOIN trainees t ON t.id = e.trainee_id
    WHERE a.paper_id = @paper_id
    ORDER BY a.submitted_at DESC
  `);
	return r.recordset;
};

const getAttemptForGrading = async (attemptId) => {
	const pool = await getPool();
	const attemptRes = await pool.request().input('id', sql.VarChar(20), attemptId).query(`
    SELECT a.*, t.full_name AS trainee_name, p.title AS paper_title, p.subject_id, p.course_id
    FROM exam_attempts a
    JOIN course_enrollments e ON e.id = a.enrollment_id
    JOIN trainees t ON t.id = e.trainee_id
    JOIN exam_papers p ON p.id = a.paper_id
    WHERE a.id = @id
  `);
	const attempt = attemptRes.recordset[0];
	if (!attempt) return null;
	const order = new Map((await attemptQuestionIds(attempt)).map((id, i) => [id, i]));
	const answersRes = await pool.request().input('attempt_id', sql.VarChar(20), attemptId).query(`
    SELECT ans.*, q.question_text, q.question_type, q.options, q.correct_option, q.points, q.image_url
    FROM exam_answers ans
    JOIN question_bank q ON q.id = ans.question_id
    WHERE ans.attempt_id = @attempt_id
  `);
	attempt.answers = answersRes.recordset
		.map((a) => parseOptions({ ...a, sort_order: order.get(a.question_id) ?? 999 }))
		.sort((x, y) => x.sort_order - y.sort_order);
	delete attempt.question_ids;
	return attempt;
};

// Cấp điểm 1 câu tự luận — nếu đây là câu NULL cuối cùng của lượt làm bài,
// tự tính tổng điểm + đóng lượt (status='graded') + đổ vào bảng điểm (pushExamScore).
const gradeEssayAnswer = async (attemptId, questionId, score, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('attempt_id', sql.VarChar(20), attemptId)
		.input('question_id', sql.VarChar(20), questionId)
		.input('score', sql.Decimal(4, 1), score)
		.query(
			'UPDATE exam_answers SET score_awarded = @score WHERE attempt_id = @attempt_id AND question_id = @question_id',
		);

	await finalizeAttemptIfComplete(attemptId, actorId);
	broadcast('update', { entity: 'exam_attempt' });
	return getAttemptForGrading(attemptId);
};

const finalizeAttemptIfComplete = async (attemptId, actorId) => {
	const pool = await getPool();
	const r = (
		await pool.request().input('attempt_id', sql.VarChar(20), attemptId).query(`
      SELECT SUM(CASE WHEN score_awarded IS NULL THEN 1 ELSE 0 END) AS pending, SUM(score_awarded) AS total
      FROM exam_answers WHERE attempt_id = @attempt_id`)
	).recordset[0];
	if (r.pending > 0) return;
	await pool
		.request()
		.input('id', sql.VarChar(20), attemptId)
		.input('manual_score', sql.Decimal(6, 2), r.total ?? 0)
		.input('actor_id', sql.VarChar(20), actorId || null)
		.query(
			"UPDATE exam_attempts SET manual_score = @manual_score, status = 'graded', updated_at = GETDATE(), updated_by = @actor_id WHERE id = @id",
		);
	await pushExamScore(attemptId, actorId);
};

// Lần thi hiện tại của phần (grades.theory_attempt / practice_attempt) — đề cuối khóa
// thi lại = lượt mới đúng số lần này. Đề đầu vào chỉ 1 lần.
const WANT_ATTEMPT_SQL = (p, e) => `CASE WHEN ${p}.purpose = 'final' THEN ISNULL((
    SELECT CASE ${p}.exam_part WHEN 'practice' THEN g.practice_attempt ELSE g.theory_attempt END
    FROM grades g WHERE g.enrollment_id = ${e}.id AND g.subject_id IS NULL), 1) ELSE 1 END`;

// Điểm bài thi (quy về thang 10 theo tổng điểm các câu của lượt đó) → lưu ở lượt làm bài,
// rồi đổ vào bảng điểm: đề đầu vào chỉ tham khảo (không đổ); thực hành đổ thẳng; lý thuyết
// = trung bình có trọng số các đề lý thuyết cuối khóa của lớp (TN × a% + TL × b%), chờ đủ
// điểm mọi đề của lần thi hiện tại mới đổ.
const pushExamScore = async (attemptId, actorId) => {
	const pool = await getPool();
	const a = (
		await pool.request().input('id', sql.VarChar(20), attemptId).query(`
      SELECT a.*, p.purpose, p.exam_part, p.course_id, e.program_id AS enrollment_program
      FROM exam_attempts a JOIN exam_papers p ON p.id = a.paper_id JOIN course_enrollments e ON e.id = a.enrollment_id
      WHERE a.id = @id`)
	).recordset[0];
	if (!a) return;
	const questions = await loadQuestions(await attemptQuestionIds(a), 'q.id, q.points');
	const maxPoints = questions.reduce((s, q) => s + Number(q.points), 0);
	const score10 = toTen(a.manual_score ?? a.auto_score ?? 0, maxPoints);
	await pool
		.request()
		.input('id', sql.VarChar(20), attemptId)
		.input('score10', sql.Decimal(4, 1), score10)
		.query('UPDATE exam_attempts SET score10 = @score10 WHERE id = @id');
	if (score10 == null || a.purpose === 'entrance') return;
	if (a.exam_part === 'practice') {
		await gradebookService.setPartFromExam(a.enrollment_id, 'practice', score10, actorId);
		return;
	}
	const parts = (
		await pool
			.request()
			.input('course_id', sql.VarChar(20), a.course_id)
			.input('enrollment_id', sql.VarChar(20), a.enrollment_id)
			.input('program_id', sql.VarChar(20), a.enrollment_program)
			.input('attempt_no', sql.Int, a.attempt_no).query(`
        SELECT p.weight,
               (SELECT TOP 1 x.score10 FROM exam_attempts x
                WHERE x.paper_id = p.id AND x.enrollment_id = @enrollment_id AND x.attempt_no = @attempt_no
                  AND x.status = 'graded') AS score10
        FROM exam_papers p
        WHERE p.course_id = @course_id AND p.purpose = 'final' AND p.exam_part = 'theory' AND p.status <> 'draft'
          AND (p.program_id IS NULL OR @program_id IS NULL OR p.program_id = @program_id)`)
	).recordset;
	const combined = theoryScore(parts);
	if (combined != null)
		await gradebookService.setPartFromExam(a.enrollment_id, 'theory', combined, actorId);
};

// ─── GV chấm bài được phân (cổng /me, không cần quyền exams:manage) ──────────
const { PAPER_GRADER_SQL } = gradebookService;

// Bài tự luận còn câu chưa chấm, thuộc đề mình là người chấm.
const listPendingForGrader = async (userId) => {
	const pool = await getPool();
	const r = await pool.request().input('uid', sql.VarChar(20), userId).query(`
    SELECT a.id AS attempt_id, a.submitted_at, p.id AS paper_id, p.title AS paper_title, p.exam_part,
           p.blind_grading, c.id AS course_id, c.name AS course_name,
           CASE WHEN p.blind_grading = 1 THEN NULL ELSE t.full_name END AS trainee_name,
           (SELECT COUNT(*) FROM exam_answers ea WHERE ea.attempt_id = a.id AND ea.score_awarded IS NULL) AS pending_count
    FROM exam_attempts a
    JOIN exam_papers p ON p.id = a.paper_id
    JOIN courses c ON c.id = p.course_id
    JOIN course_enrollments e ON e.id = a.enrollment_id
    JOIN trainees t ON t.id = e.trainee_id
    WHERE a.status = 'submitted' AND ${PAPER_GRADER_SQL('p')}
    ORDER BY a.submitted_at
  `);
	return r.recordset;
};

const assertGrader = async (attemptId, userId) => {
	const pool = await getPool();
	const ok = (
		await pool
			.request()
			.input('id', sql.VarChar(20), attemptId)
			.input('uid', sql.VarChar(20), userId).query(`
      SELECT p.blind_grading FROM exam_attempts a JOIN exam_papers p ON p.id = a.paper_id
      WHERE a.id = @id AND ${PAPER_GRADER_SQL('p')}
    `)
	).recordset[0];
	if (!ok) throw httpError(403, 'Bạn không phải người chấm của bài thi này.');
	return ok;
};

// Đề bật chấm ẩn danh: ẩn tên học viên, chỉ hiện mã bài.
const getAttemptForGrader = async (attemptId, userId) => {
	const { blind_grading } = await assertGrader(attemptId, userId);
	const attempt = await getAttemptForGrading(attemptId);
	if (attempt && blind_grading) {
		attempt.trainee_name = null;
		attempt.enrollment_id = null;
	}
	return attempt;
};

const gradeEssayAsGrader = async (attemptId, questionId, score, userId) => {
	await assertGrader(attemptId, userId);
	await gradeEssayAnswer(attemptId, questionId, score, userId);
	return getAttemptForGrader(attemptId, userId);
};

// ─── Học viên làm bài ────────────────────────────────────────────────────────
// Đề của lớp mình: đề không gắn lớp, hoặc đúng chương trình đã ghi danh.
const PAPER_FOR_ENROLLMENT_SQL = (p, e) =>
	`(${p}.program_id IS NULL OR ${e}.program_id IS NULL OR ${p}.program_id = ${e}.program_id)`;

// Đề đang mở (status='published') dành cho lớp actor đã được duyệt — kèm lượt làm bài
// mới nhất; đã được thi lại (lần thi của phần > lần của lượt cũ) thì coi như chưa làm.
const listAvailablePapersForUser = async (actor) => {
	const pool = await getPool();
	const r = await pool.request().input('user_id', sql.VarChar(20), actor.id).query(`
    SELECT p.id, p.title, p.duration_minutes, p.purpose, p.exam_part, c.id AS course_id, c.name AS course_name,
           e.id AS enrollment_id, att.id AS attempt_id, att.status AS attempt_status, att.attempt_no,
           ${WANT_ATTEMPT_SQL('p', 'e')} AS want_no
    FROM exam_papers p
    JOIN courses c ON c.id = p.course_id
    JOIN course_enrollments e ON e.course_id = c.id AND e.status = 'approved' AND ${PAPER_FOR_ENROLLMENT_SQL('p', 'e')}
    JOIN trainees t ON t.id = e.trainee_id AND t.user_id = @user_id
    OUTER APPLY (SELECT TOP 1 x.id, x.status, x.attempt_no FROM exam_attempts x
                 WHERE x.paper_id = p.id AND x.enrollment_id = e.id ORDER BY x.attempt_no DESC) att
    WHERE p.status = 'published'
    ORDER BY p.created_at DESC
  `);
	return r.recordset.map(({ want_no, attempt_no, ...p }) =>
		attempt_no != null && attempt_no < want_no
			? { ...p, attempt_id: null, attempt_status: null, retake_no: want_no }
			: p,
	);
};

const assertEnrollment = async (pool, paperId, actor) => {
	const r = await pool
		.request()
		.input('paper_id', sql.VarChar(20), paperId)
		.input('user_id', sql.VarChar(20), actor.id).query(`
      SELECT p.*, e.id AS enrollment_id, ${WANT_ATTEMPT_SQL('p', 'e')} AS want_no
      FROM exam_papers p
      JOIN course_enrollments e ON e.course_id = p.course_id AND e.status = 'approved' AND ${PAPER_FOR_ENROLLMENT_SQL('p', 'e')}
      JOIN trainees t ON t.id = e.trainee_id AND t.user_id = @user_id
      WHERE p.id = @paper_id
    `);
	const row = r.recordset[0];
	if (!row) {
		throw httpError(403, 'Bạn không có quyền làm đề thi này.');
	}
	if (row.status !== 'published') {
		throw httpError(403, 'Đề thi hiện không mở.');
	}
	return row;
};

// Bộ câu cho lượt mới: đề chọn tay = câu của đề; đề chung = câu của đề, trộn thứ tự;
// nhiều mã = chia lần lượt các mã; mỗi HV 1 đề (và mọi đề ngẫu nhiên khi THI LẠI) = bốc
// mới từ ngân hàng, tránh câu học viên đã gặp ở các lượt trước.
const buildAttemptQuestions = async (paper, enrollmentId, attemptNo, seed) => {
	const pool = await getPool();
	const rand = seededRandom(seed);
	if (isRandom(paper) && (paper.code_mode === 'per_trainee' || attemptNo > 1)) {
		const seen = (
			await pool
				.request()
				.input('enrollment_id', sql.VarChar(20), enrollmentId)
				.query(
					'SELECT question_ids FROM exam_attempts WHERE enrollment_id = @enrollment_id AND question_ids IS NOT NULL',
				)
		).recordset.flatMap((x) => JSON.parse(x.question_ids));
		return { ids: drawSet(paper, await bankOf(paper), new Set(seen), rand), codeNo: null };
	}
	let codeNo = null;
	if (paper.code_mode === 'codes') {
		const n = (
			await pool
				.request()
				.input('paper_id', sql.VarChar(20), paper.id)
				.query('SELECT COUNT(*) AS n FROM exam_attempts WHERE paper_id = @paper_id')
		).recordset[0].n;
		codeNo = (n % Math.max(1, paper.code_count || 1)) + 1;
	}
	const ids = (
		await pool
			.request()
			.input('paper_id', sql.VarChar(20), paper.id)
			.input('code_no', sql.Int, codeNo)
			.query(
				'SELECT question_id FROM exam_paper_questions WHERE paper_id = @paper_id AND ((@code_no IS NULL AND code_no IS NULL) OR code_no = @code_no) ORDER BY sort_order',
			)
	).recordset.map((x) => x.question_id);
	// Đề chọn tay giữ thứ tự soạn; đề ngẫu nhiên trộn thứ tự câu cho từng học viên
	return { ids: paper.code_mode ? shuffle(ids, rand) : ids, codeNo };
};

// Bắt đầu làm bài — đang có lượt dở thì trả lại (resume). Lượt mới (lần đầu / thi lại)
// lưu sẵn bộ câu + thứ tự. Đề ngẫu nhiên: trộn cả thứ tự phương án (cố định theo lượt).
const startAttempt = async (paperId, actor) => {
	const pool = await getPool();
	const info = await assertEnrollment(pool, paperId, actor);

	const latest = (
		await pool
			.request()
			.input('paper_id', sql.VarChar(20), paperId)
			.input('enrollment_id', sql.VarChar(20), info.enrollment_id)
			.query(
				'SELECT TOP 1 * FROM exam_attempts WHERE paper_id = @paper_id AND enrollment_id = @enrollment_id ORDER BY attempt_no DESC',
			)
	).recordset[0];

	let attempt = latest;
	if (!latest || latest.attempt_no < info.want_no) {
		const attemptNo = Math.max(1, info.want_no);
		const newId = `EA${randomUUID().replace(/-/g, '').slice(0, 18).toUpperCase()}`;
		const { ids, codeNo } = await buildAttemptQuestions(info, info.enrollment_id, attemptNo, newId);
		if (!ids.length) throw httpError(400, 'Đề thi chưa có câu hỏi.');
		attempt = (
			await pool
				.request()
				.input('id', sql.VarChar(20), newId)
				.input('paper_id', sql.VarChar(20), paperId)
				.input('enrollment_id', sql.VarChar(20), info.enrollment_id)
				.input('attempt_no', sql.Int, attemptNo)
				.input('code_no', sql.Int, codeNo)
				.input('question_ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
				.input('actor_id', sql.VarChar(20), actor.id).query(`
          INSERT INTO exam_attempts (id, paper_id, enrollment_id, attempt_no, code_no, question_ids, created_by)
          VALUES (@id, @paper_id, @enrollment_id, @attempt_no, @code_no, @question_ids, @actor_id);
          SELECT * FROM exam_attempts WHERE id = @id;`)
		).recordset[0];
	} else if (latest.status !== 'in_progress') {
		throw httpError(409, 'Bạn đã nộp đề thi này rồi.');
	}

	const questions = await loadQuestions(
		await attemptQuestionIds(attempt),
		'q.id, q.question_type, q.question_text, q.options, q.points, q.image_url',
	);
	const { question_ids: _ids, ...attemptOut } = attempt;
	return {
		attempt: attemptOut,
		duration_minutes: info.duration_minutes,
		questions: questions.map((q) => {
			const row = parseOptions(q);
			return info.code_mode && row.options?.length
				? { ...row, options: shuffle(row.options, seededRandom(`${attempt.id}:${q.id}`)) }
				: row;
		}),
	};
};

// Nộp bài — chấm ngay câu trắc nghiệm, câu tự luận để score_awarded NULL chờ
// chấm tay. Nếu đề không có câu tự luận nào, hoàn tất luôn (không chờ ai chấm).
// Cho nộp trễ tối đa chừng này sau khi hết giờ (độ trễ mạng / trình duyệt tự nộp)
const SUBMIT_GRACE_SEC = 120;

const submitAttempt = async (paperId, answers, actor) => {
	const pool = await getPool();
	const info = await assertEnrollment(pool, paperId, actor);

	// "Nhận" lượt làm bài NGUYÊN TỬ: chỉ 1 request đổi được in_progress → submitted.
	// Trước đây SELECT rồi mới UPDATE — nộp 2 lần song song thì cả 2 cùng ghi đáp án.
	// Đồng thời tính trễ hạn theo giờ SQL Server (không tin đồng hồ trình duyệt):
	// quá started_at + thời lượng + SUBMIT_GRACE_SEC thì đáp án không được tính.
	const claimed = (
		await pool
			.request()
			.input('paper_id', sql.VarChar(20), paperId)
			.input('enrollment_id', sql.VarChar(20), info.enrollment_id)
			.input('actor_id', sql.VarChar(20), actor.id)
			.input('limit_sec', sql.Int, (Number(info.duration_minutes) || 0) * 60 + SUBMIT_GRACE_SEC)
			.query(`
				DECLARE @r TABLE (id VARCHAR(20), late BIT, question_ids NVARCHAR(MAX));
				UPDATE exam_attempts SET status = 'submitted', submitted_at = GETDATE(), updated_at = GETDATE(), updated_by = @actor_id
				OUTPUT INSERTED.id,
				       CASE WHEN @limit_sec > ${SUBMIT_GRACE_SEC}
				             AND INSERTED.submitted_at > DATEADD(SECOND, @limit_sec, INSERTED.started_at)
				            THEN 1 ELSE 0 END,
				       INSERTED.question_ids
				INTO @r
				WHERE paper_id = @paper_id AND enrollment_id = @enrollment_id AND status = 'in_progress';
				SELECT id, late, question_ids FROM @r;
			`)
	).recordset[0];
	if (!claimed) {
		throw httpError(409, 'Không tìm thấy lượt làm bài đang mở, hoặc bạn đã nộp rồi.');
	}
	const attempt = { id: claimed.id };
	const late = !!claimed.late;
	// Nộp quá giờ: vẫn đóng lượt làm bài (không làm lại được) nhưng bỏ đáp án
	if (late) answers = [];

	const questions = await loadQuestions(
		await attemptQuestionIds({ ...claimed, paper_id: paperId }),
		'q.id, q.question_type, q.correct_option, q.points',
	);
	const answerMap = new Map((answers || []).map((a) => [a.question_id, a]));

	let autoScore = 0;
	let hasEssay = false;
	for (const q of questions) {
		const ans = answerMap.get(q.id);
		const isEssay = q.question_type === 'essay';
		hasEssay = hasEssay || isEssay;
		const selected = !isEssay ? ans?.selected_option || null : null;
		const essayText = isEssay ? ans?.essay_text || null : null;
		const scoreAwarded = isEssay ? null : selected && selected === q.correct_option ? q.points : 0;
		if (!isEssay) autoScore += Number(scoreAwarded);

		await pool
			.request()
			.input('attempt_id', sql.VarChar(20), attempt.id)
			.input('question_id', sql.VarChar(20), q.id)
			.input('selected_option', sql.NVarChar(255), selected)
			.input('essay_text', sql.NVarChar(sql.MAX), essayText)
			.input('score_awarded', sql.Decimal(4, 1), scoreAwarded).query(`
        DECLARE @new_id VARCHAR(20) = 'EAN' + LEFT(REPLACE(NEWID(),'-',''), 17);
        INSERT INTO exam_answers (id, attempt_id, question_id, selected_option, essay_text, score_awarded)
        VALUES (@new_id, @attempt_id, @question_id, @selected_option, @essay_text, @score_awarded);
      `);
	}

	await pool
		.request()
		.input('id', sql.VarChar(20), attempt.id)
		.input('auto_score', sql.Decimal(6, 2), autoScore)
		.input('actor_id', sql.VarChar(20), actor.id)
		.input('status', sql.VarChar(20), hasEssay ? 'submitted' : 'graded').query(`
      UPDATE exam_attempts SET submitted_at = GETDATE(), auto_score = @auto_score, status = @status,
        updated_at = GETDATE(), updated_by = @actor_id WHERE id = @id
    `);

	broadcast('update', { entity: 'exam_attempt' });

	// Không có câu tự luận nào chờ chấm — hoàn tất ngay, đổ điểm luôn.
	if (!hasEssay) await pushExamScore(attempt.id, actor.id);

	return { attempt_id: attempt.id, auto_score: autoScore, has_essay: hasEssay, late };
};

module.exports = {
	listQuestions,
	getQuestion,
	createQuestion,
	createQuestionsBulk,
	updateQuestion,
	removeQuestion,
	listPapers,
	getPaper,
	setPaperQuestions,
	createPaper,
	updatePaper,
	removePaper,
	listAttempts,
	getAttemptForGrading,
	gradeEssayAnswer,
	listPendingForGrader,
	getAttemptForGrader,
	gradeEssayAsGrader,
	listAvailablePapersForUser,
	startAttempt,
	submitAttempt,
};
