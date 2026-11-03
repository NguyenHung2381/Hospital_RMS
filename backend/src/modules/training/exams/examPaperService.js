const { getPool, sql, withTransaction } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { httpError } = require('../../../utils/httpError');
const { seededRandom } = require('./examGen');
const {
	POOLS,
	CODE_MODES,
	PAPER_QUESTION_TYPE,
	parseOptions,
	isRandom,
	bankOf,
	drawSet,
} = require('./examShared');

// ─── Đề thi ──────────────────────────────────────────────────────────────────
const paperSelect = `
  SELECT p.*, c.name AS course_name, s.title AS subject_name, tp.code AS program_code, tp.name AS program_name,
         (SELECT COUNT(*) FROM exam_paper_questions epq WHERE epq.paper_id = p.id AND COALESCE(epq.code_no, 1) = 1) AS question_count,
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
    ORDER BY COALESCE(epq.code_no, 0), epq.sort_order ASC
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

// 1 câu INSERT cho cả bộ (trước đây 1 round-trip / câu hỏi). sort_order = vị trí
// trong ids; id không có trong ngân hàng / sai loại câu thì bỏ qua.
const insertPaperQuestions = async (paperId, ids, codeNo, actorId, onlyType = null) => {
	if (!ids.length) return;
	const pool = await getPool();
	await pool
		.request()
		.input('paper_id', sql.VarChar(20), paperId)
		.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
		.input('only_type', sql.VarChar(20), onlyType)
		.input('code_no', sql.Int, codeNo)
		.input('actor_id', sql.VarChar(20), actorId || null).query(`
      INSERT INTO exam_paper_questions (id, paper_id, question_id, sort_order, code_no, created_by)
      SELECT 'EPQ' + LEFT(REPLACE(NEWID(),'-',''), 17), @paper_id, q.id, CAST(j.[key] AS INT), @code_no, @actor_id
      FROM OPENJSON(@ids) j
      JOIN question_bank q ON q.id = CAST(j.[value] AS VARCHAR(50))
      WHERE @only_type IS NULL OR q.question_type = @only_type
    `);
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

module.exports = {
	listPapers,
	getPaper,
	setPaperQuestions,
	createPaper,
	updatePaper,
	removePaper,
};
