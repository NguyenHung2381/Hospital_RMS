// Hằng số + hàm dùng chung của các service đề thi (ngân hàng, đề, chấm, làm bài).
const { getPool, sql } = require('../../../config/db');
const { parseJsonArray } = require('../../../utils/sqlFilters');
const { httpError } = require('../../../utils/httpError');
const { drawQuestions } = require('./examGen');

const QUESTION_TYPES = ['single_choice', 'essay'];
// Mỗi chương trình 1 ngân hàng, chia 2 kho: kiểm tra đầu vào / thi cuối khóa (2026-11-27_exam_bank_programs)
const POOLS = ['entrance', 'final'];
const CODE_MODES = ['per_trainee', 'shuffled', 'codes'];
// Loại đề → loại câu hỏi được phép đưa vào. paper_type NULL = đề hỗn hợp TN + TL
// (đầu vào hoặc cuối khóa, và đề cũ tạo trước khi có cột này) — không lọc.
const PAPER_QUESTION_TYPE = { multiple_choice: 'single_choice', essay: 'essay' };

const parseOptions = (row) =>
	row.options === undefined ? row : { ...row, options: parseJsonArray(row.options) };

const isRandom = (p) => (p.gen_mc_count ?? 0) + (p.gen_essay_count ?? 0) > 0;

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
				`SELECT ${columns} FROM question_bank q WHERE q.id IN (SELECT CAST([value] AS VARCHAR(50)) FROM OPENJSON(@ids))`,
			)
	).recordset;
	const byId = new Map(rows.map((r) => [r.id, r]));
	return ids.map((id, i) => byId.get(id) && { ...byId.get(id), sort_order: i }).filter(Boolean);
};

module.exports = {
	QUESTION_TYPES,
	POOLS,
	CODE_MODES,
	PAPER_QUESTION_TYPE,
	parseOptions,
	isRandom,
	bankOf,
	drawSet,
	attemptQuestionIds,
	loadQuestions,
};
