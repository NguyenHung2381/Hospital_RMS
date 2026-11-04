// Test tích hợp các câu ghi gộp (jsonValues / jsonRows — 1 câu cho cả danh sách
// thay vì 1 round-trip / dòng) trên PostgreSQL THẬT. Mọi thứ chạy trong 1 transaction và
// ROLLBACK ở cuối ⇒ không để lại dữ liệu, an toàn trên DB dev. Không chạy trên CI.
//
//   docker exec hospital_rms_dev-backend-1 npm run test:smoke   (chạy cùng smoke.test.js)
//
// getPool / withTransaction được thay bằng bản dùng chung transaction đó TRƯỚC khi
// require service (service destructure getPool lúc nạp module). Request trên 1
// transaction không chạy song song được ⇒ xếp hàng tuần tự. broadcast tắt để
// không bắn sự kiện realtime tới trình duyệt đang mở.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const db = require('../src/config/db');
const { sql } = db;
require('../src/modules/events/eventService').broadcast = () => {};

let tx = null;
let queue = Promise.resolve();
const serial = (run) => {
	const p = queue.then(run, run);
	queue = p.catch(() => {});
	return p;
};
const RealRequest = sql.Request;
const txRequest = () => {
	const req = new RealRequest(tx);
	const wrap = {
		input: (...a) => (req.input(...a), wrap),
		output: (...a) => (req.output(...a), wrap),
		query: (text) => serial(() => req.query(text)),
		batch: (text) => serial(() => req.batch(text)),
		execute: (proc) => serial(() => req.execute(proc)),
		// queryAll / queryBatch của adapter đọc tham số + transaction của request
		get params() {
			return req.params;
		},
		get parent() {
			return req.parent;
		},
	};
	return wrap;
};
const realGetPool = db.getPool;
db.getPool = async () => ({ request: txRequest, connected: true });
db.withTransaction = async (fn) => fn(tx);
sql.Request = new Proxy(sql.Request, {
	construct: (Target, args) => (args[0] === tx ? txRequest() : new Target(...args)),
});

const questionBankService = require('../src/modules/training/exams/questionBankService');
const examPaperService = require('../src/modules/training/exams/examPaperService');
const examAttemptService = require('../src/modules/training/exams/examAttemptService');
const examGradingService = require('../src/modules/training/exams/examGradingService');
const gradebookService = require('../src/modules/training/courses/gradebookService');
const lessonService = require('../src/modules/training/programs/programLessonService');
const { genGradeId } = require('../src/utils/idGenerator');

const q = async (text, inputs = {}) => {
	const req = txRequest();
	for (const [k, v] of Object.entries(inputs)) req.input(k, v);
	return (await req.query(text)).recordset;
};

test('ghi gộp trên PostgreSQL thật (rollback)', async (t) => {
	const pool = await realGetPool();
	tx = new sql.Transaction(pool);
	await tx.begin();
	t.after(async () => {
		await tx.rollback();
		await pool.close();
	});

	await t.test('đề thi: thêm câu vào đề, làm bài, nộp, chấm tự luận', async (s) => {
		const [enr] = await q(`
		  SELECT e.id AS enrollment_id, e.course_id, COALESCE(t.user_id, t.staff_user_id) AS user_id
		  FROM course_enrollments e JOIN trainees t ON t.id = e.trainee_id
		  WHERE e.status = 'approved' AND COALESCE(t.user_id, t.staff_user_id) IS NOT NULL
		  LIMIT 1`);
		if (!enr) return s.skip('DB chưa có lượt ghi danh đã duyệt gắn tài khoản');
		const actor = { id: enr.user_id };

		const mk = (data) => questionBankService.createQuestion({ points: 1, ...data }, enr.user_id);
		const q1 = await mk({
			question_text: 'Câu 1',
			options: ['Đáp án Á', 'B'],
			correct_option: 'Đáp án Á',
		});
		const q2 = await mk({
			question_text: 'Câu 2',
			options: ['C', 'D'],
			correct_option: 'C',
			points: 2,
		});
		const q3 = await mk({ question_text: 'Câu 3 tự luận', question_type: 'essay' });

		// Mã câu không tồn tại bị bỏ qua; sort_order = vị trí trong mảng gửi lên
		const paper = await examPaperService.createPaper(
			{
				course_id: enr.course_id,
				title: 'TEST rollback',
				paper_type: null,
				status: 'published',
				purpose: 'entrance',
				question_ids: [q1.id, 'KHONG_TON_TAI', q2.id, q3.id],
			},
			enr.user_id,
		);
		assert.deepEqual(
			paper.questions.map((x) => [x.id, x.sort_order]),
			[
				[q1.id, 0],
				[q2.id, 2],
				[q3.id, 3],
			],
		);

		// Đề trắc nghiệm: chỉ giữ câu đúng loại
		const mcOnly = await examPaperService.setPaperQuestions(paper.id, [q3.id, q1.id], enr.user_id);
		assert.deepEqual(
			mcOnly.map((x) => x.id),
			[q3.id, q1.id],
		); // đề hỗn hợp: giữ cả 2, theo thứ tự gửi
		await examPaperService.updatePaper(paper.id, { paper_type: 'multiple_choice' }, enr.user_id);
		const after = await examPaperService.getPaper(paper.id);
		assert.deepEqual(
			after.questions.map((x) => x.id),
			[q1.id],
		);
		await examPaperService.updatePaper(
			paper.id,
			{ paper_type: null, question_ids: [q1.id, q2.id, q3.id] },
			enr.user_id,
		);

		// Làm bài: không lộ đáp án
		const started = await examAttemptService.startAttempt(paper.id, actor);
		assert.equal(started.questions.length, 3);
		assert.ok(started.questions.every((x) => x.correct_option === undefined));

		const res = await examAttemptService.submitAttempt(
			paper.id,
			[
				{ question_id: q1.id, selected_option: 'Đáp án Á' },
				{ question_id: q2.id, selected_option: 'D' },
				{ question_id: q3.id, essay_text: 'Bài làm có dấu tiếng Việt ữ ỹ' },
			],
			actor,
		);
		assert.equal(res.auto_score, 1);
		assert.equal(res.has_essay, true);
		assert.equal(res.late, false);

		const answers = await q(
			`SELECT question_id, selected_option, essay_text, score_awarded FROM exam_answers
			 WHERE attempt_id = @id ORDER BY question_id`,
			{ id: res.attempt_id },
		);
		const byQ = Object.fromEntries(answers.map((a) => [a.question_id, a]));
		assert.equal(answers.length, 3);
		assert.equal(byQ[q1.id].selected_option, 'Đáp án Á');
		assert.equal(Number(byQ[q1.id].score_awarded), 1);
		assert.equal(Number(byQ[q2.id].score_awarded), 0);
		assert.equal(byQ[q3.id].score_awarded, null);
		assert.equal(byQ[q3.id].essay_text, 'Bài làm có dấu tiếng Việt ữ ỹ');
		const [att] = await q('SELECT status, auto_score FROM exam_attempts WHERE id = @id', {
			id: res.attempt_id,
		});
		assert.equal(att.status, 'submitted');
		assert.equal(Number(att.auto_score), 1);

		// Chấm câu tự luận cuối ⇒ đóng lượt, điểm thang 10 = (1 + 0 + 0.5) / 4 điểm tối đa
		const graded = await examGradingService.gradeEssayAnswer(
			res.attempt_id,
			q3.id,
			0.5,
			enr.user_id,
		);
		assert.equal(graded.status, 'graded');
		assert.equal(Number(graded.manual_score), 1.5);
		assert.equal(Number(graded.score10), 3.8);

		// Nộp lại ⇒ 409, không ghi thêm đáp án
		await assert.rejects(() => examAttemptService.submitAttempt(paper.id, [], actor), {
			statusCode: 409,
		});
	});

	await t.test('bảng điểm: recompute ghi score/result/classification cả lớp 1 câu', async (s) => {
		const [row] = await q(`
		  SELECT course_id FROM course_enrollments WHERE status = 'approved'
		  GROUP BY course_id ORDER BY COUNT(*) DESC LIMIT 1`);
		if (!row) return s.skip('DB chưa có lượt ghi danh đã duyệt');
		// Điểm mẫu khác nhau cho từng học viên của lớp (dòng nào chưa có thì tạo)
		const noGrade = await q(
			`SELECT e.id, e.program_id FROM course_enrollments e
			 WHERE e.course_id = @c AND e.status = 'approved'
			   AND NOT EXISTS (SELECT 1 FROM grades g WHERE g.enrollment_id = e.id AND g.subject_id IS NULL)`,
			{ c: row.course_id },
		);
		for (const e of noGrade)
			await q(
				`INSERT INTO grades (id, enrollment_id, subject_id, program_id, created_by)
				 VALUES (@id, @e, NULL, @p, 'TEST')`,
				{ id: await genGradeId(tx), e: e.id, p: e.program_id },
			);
		await q(
			`UPDATE grades g SET theory_score = 4 + (x.n % 7), practice_score = 3 + (x.n % 8), locked_at = NULL
			 FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS n FROM course_enrollments
			       WHERE course_id = @c AND status = 'approved') x
			 WHERE x.id = g.enrollment_id AND g.subject_id IS NULL`,
			{ c: row.course_id },
		);
		const book = await gradebookService.getGradebook(row.course_id);
		const withGrade = book.rows.filter((r) => r.grade_id);
		await q(
			`UPDATE grades g SET score = NULL, result = NULL, classification = NULL
		         FROM course_enrollments e
		         WHERE e.id = g.enrollment_id AND e.course_id = @c AND g.subject_id IS NULL`,
			{ c: row.course_id },
		);

		await gradebookService.recompute(row.course_id);

		const saved = await q(
			`SELECT g.id, g.score, g.result, g.classification FROM grades g
			 JOIN course_enrollments e ON e.id = g.enrollment_id WHERE e.course_id = @c AND g.subject_id IS NULL`,
			{ c: row.course_id },
		);
		const byId = new Map(saved.map((x) => [x.id, x]));
		for (const r of withGrade) {
			const got = byId.get(r.grade_id);
			assert.equal(got.score == null ? null : Number(got.score), r.computed.total ?? null);
			assert.equal(got.result, r.computed.result ?? null);
			assert.equal(got.classification, r.computed.classification ?? null);
		}
		s.diagnostic(`${withGrade.length} dòng điểm`);
	});

	await t.test('bài học: sắp xếp lại, gán chương trình, gán khoa', async (s) => {
		const [prog] = await q(`
		  SELECT program_id FROM lesson_programs GROUP BY program_id HAVING COUNT(*) >= 2 ORDER BY COUNT(*) DESC LIMIT 1`);
		const progs = await q('SELECT id FROM training_programs ORDER BY id LIMIT 2');
		const depts = await q('SELECT id FROM departments ORDER BY id LIMIT 2');
		if (!prog || progs.length < 2 || depts.length < 2)
			return s.skip('Thiếu dữ liệu chương trình / khoa');

		const lessons = await lessonService.listLessons(prog.program_id);
		const reversed = [...lessons].reverse().map((l) => l.id);
		const reordered = await lessonService.reorderLessons(prog.program_id, reversed, 'TEST');
		assert.deepEqual(
			reordered.map((l) => l.id),
			reversed,
		);
		const orders = await q('SELECT id, display_order FROM lesson_programs WHERE program_id = @p', {
			p: prog.program_id,
		});
		const orderOf = new Map(orders.map((o) => [o.id, o.display_order]));
		reversed.forEach((id, i) => assert.equal(orderOf.get(id), i));
		// Mã lượt gắn của chương trình khác không bị đụng tới
		await lessonService.reorderLessons('CHUONG_TRINH_KHAC', reversed, 'TEST');
		const again = await lessonService.listLessons(prog.program_id);
		assert.deepEqual(
			again.map((l) => l.id),
			reversed,
		);

		const lessonId = lessons[0].lesson_id;
		const ids = await lessonService.setLessonPrograms(
			lessonId,
			[progs[1].id, 'KHONG_TON_TAI', progs[0].id, progs[1].id],
			'TEST',
		);
		assert.deepEqual([...ids].sort(), [progs[0].id, progs[1].id].sort());
		const links = await q(
			'SELECT program_id, display_order FROM lesson_programs WHERE lesson_id = @l ORDER BY display_order',
			{ l: lessonId },
		);
		assert.deepEqual(
			links.map((x) => [x.program_id, x.display_order]),
			[
				[progs[1].id, 0],
				[progs[0].id, 2],
			],
		);

		await lessonService.setLessonDepartments(lessonId, [depts[1].id, 'KHONG_TON_TAI', depts[0].id]);
		const ld = await q(
			'SELECT department_id, display_order FROM lesson_departments WHERE lesson_id = @l ORDER BY display_order',
			{ l: lessonId },
		);
		assert.deepEqual(
			ld.map((x) => [x.department_id, x.display_order]),
			[
				[depts[1].id, 0],
				[depts[0].id, 2],
			],
		);
		await lessonService.setLessonDepartments(lessonId, []);
		assert.equal(
			(await q('SELECT 1 FROM lesson_departments WHERE lesson_id = @l', { l: lessonId })).length,
			0,
		);
	});
});
