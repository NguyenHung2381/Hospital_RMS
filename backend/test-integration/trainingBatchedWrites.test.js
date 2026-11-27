// Test tích hợp các câu ghi gộp của module đào tạo (rà soát 2026-11-26, xem
// docs/review/2026-11-26/03-training.md) trên PostgreSQL THẬT. Harness giống
// batchedWrites.test.js: mọi thứ trong 1 transaction, ROLLBACK ở cuối ⇒ không để lại dữ
// liệu, an toàn trên DB dev. withActorTransaction bị chặn (nó tự mở giao dịch riêng và
// COMMIT). Thiếu dữ liệu mẫu thì bỏ qua từng phần. Không chạy trên CI.
//
//   docker exec hospital_rms_dev-backend-1 npm run test:smoke   (chạy cùng smoke.test.js)
//
// Vài hàm ghi không export (writeAssistants, setPaperGraders, setProgramTraineeTypes,
// setPrograms) được gọi trực tiếp qua loadWith: biên dịch lại file nguồn kèm 1 dòng export.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');

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
// Chặn mọi đường ghi tự mở giao dịch riêng (sẽ COMMIT thật)
db.withActorTransaction = async () => {
	throw new Error('withActorTransaction bị chặn trong script kiểm tra');
};
sql.Request = new Proxy(sql.Request, {
	construct: (Target, args) => (args[0] === tx ? txRequest() : new Target(...args)),
});

// Nạp module kèm các hàm nội bộ (không export) để gọi trực tiếp
const loadWith = (rel, names) => {
	const file = path.resolve(__dirname, '..', rel);
	const m = new Module(file, module);
	m.filename = file;
	m.paths = Module._nodeModulePaths(path.dirname(file));
	m._compile(
		`${fs.readFileSync(file, 'utf8')}\nmodule.exports.__t = { ${names.join(', ')} };`,
		file,
	);
	return m.exports.__t;
};

const T = 'src/modules/training/';
const { writeAssistants } = loadWith(`${T}courses/classSessionService.js`, ['writeAssistants']);
const { setPaperGraders } = loadWith(`${T}exams/examPaperService.js`, ['setPaperGraders']);
const { setProgramTraineeTypes } = loadWith(`${T}programs/trainingProgramService.js`, [
	'setProgramTraineeTypes',
]);
const { setPrograms } = loadWith(`${T}courses/courseService.js`, ['setPrograms']);
const lessonService = require(`../${T}programs/programLessonService`);
const rotationService = require(`../${T}courses/enrollmentRotationService`);
const programClassService = require(`../${T}courses/programClassService`);
programClassService.mailTrainees = () => {};
programClassService.notifyIfReady = async () => {};
const waitlistService = require(`../${T}courses/waitlistTransferService`);

const q = async (text, inputs = {}) => {
	const req = txRequest();
	for (const [k, v] of Object.entries(inputs)) req.input(k, v);
	return (await req.query(text)).recordset;
};
const ids = (rows, k = 'lecturer_id') => rows.map((r) => r[k]).sort();

test('ghi gộp training-cleanup trên PostgreSQL thật (rollback)', async (t) => {
	const pool = await realGetPool();
	tx = new sql.Transaction(pool);
	await tx.begin();
	t.after(async () => {
		await tx.rollback();
		await pool.close();
	});
	const [user] = await q('SELECT id FROM users ORDER BY created_at LIMIT 1');
	const actor = user.id;
	const lecs = await q('SELECT id FROM lecturers ORDER BY id LIMIT 2');

	await t.test('writeAssistants: thay toàn bộ trợ giảng 1 buổi', async (s) => {
		const [sess] = await q('SELECT id FROM class_sessions LIMIT 1');
		if (!sess || lecs.length < 2) return s.skip('thiếu dữ liệu');
		await writeAssistants(sess.id, [lecs[0].id, lecs[1].id], actor);
		const r = await q(
			'SELECT lecturer_id, created_by FROM session_lecturers WHERE session_id = @s',
			{
				s: sess.id,
			},
		);
		assert.deepEqual(ids(r), [lecs[0].id, lecs[1].id].sort());
		assert.ok(r.every((x) => x.created_by === actor));
		await writeAssistants(sess.id, [], actor);
		assert.equal(
			(await q('SELECT 1 FROM session_lecturers WHERE session_id = @s', { s: sess.id })).length,
			0,
		);
	});

	await t.test('setPaperGraders: bỏ id không có trong danh mục GV', async (s) => {
		const [paper] = await q('SELECT id FROM exam_papers LIMIT 1');
		if (!paper || lecs.length < 2) return s.skip('thiếu dữ liệu');
		await setPaperGraders(paper.id, [lecs[0].id, 'KHONG_TON_TAI', lecs[1].id], actor);
		const r = await q('SELECT lecturer_id FROM exam_paper_graders WHERE paper_id = @p', {
			p: paper.id,
		});
		assert.deepEqual(ids(r), [lecs[0].id, lecs[1].id].sort());
		await setPaperGraders(paper.id, [], actor);
		assert.equal(
			(await q('SELECT 1 FROM exam_paper_graders WHERE paper_id = @p', { p: paper.id })).length,
			0,
		);
	});

	await t.test('EXPLAIN: câu INSERT người chấm đề + UPDATE chuyển danh sách chờ', async () => {
		const { jsonValues, nowSql } = db;
		const ex = (text, inputs) => {
			const req = txRequest();
			for (const [k, [type, v]] of Object.entries(inputs)) req.input(k, type, v);
			return req.query(`EXPLAIN ${text}`);
		};
		await ex(
			`INSERT INTO exam_paper_graders (paper_id, lecturer_id, created_by)
          SELECT @paper_id, l.id, @actor_id
          FROM ${jsonValues('@ids', { type: 'VARCHAR(20)' })} j JOIN lecturers l ON l.id = j.value`,
			{
				paper_id: [sql.VarChar(20), 'EP_X'],
				ids: [sql.NVarChar(sql.MAX), JSON.stringify(['A', 'B'])],
				actor_id: [sql.VarChar(20), actor],
			},
		);
		await ex(
			`UPDATE course_enrollments
        SET course_id = @course_id, status = 'approved', updated_at = ${nowSql}, updated_by = @actor_id
        WHERE id IN ${jsonValues('@ids', { type: 'VARCHAR(20)' })} AND status = 'waitlisted'`,
			{
				ids: [sql.NVarChar(sql.MAX), JSON.stringify(['A'])],
				course_id: [sql.VarChar(20), 'KH_X'],
				actor_id: [sql.VarChar(20), actor],
			},
		);
	});

	await t.test('setLessonLecturers (chương trình): GV chính + GV phụ trong 1 câu', async (s) => {
		const [lp] = await q('SELECT program_id, lesson_id FROM lesson_programs LIMIT 1');
		if (!lp || lecs.length < 2) return s.skip('thiếu dữ liệu');
		await lessonService.setLessonLecturers(
			lp.program_id,
			lp.lesson_id,
			{ main: lecs[0].id, assistants: [lecs[1].id, lecs[0].id] },
			actor,
		);
		const r = await q(
			'SELECT lecturer_id, role FROM program_lesson_lecturers WHERE program_id = @p AND lesson_id = @l ORDER BY role DESC',
			{ p: lp.program_id, l: lp.lesson_id },
		);
		assert.deepEqual(
			r.map((x) => [x.lecturer_id, x.role]),
			[
				[lecs[0].id, 'main'],
				[lecs[1].id, 'assistant'],
			],
		);
	});

	await t.test('linkLessons: 1 câu, thứ tự nối tiếp, bỏ id đã gắn / không tồn tại', async (s) => {
		const [prog] = await q(
			'SELECT program_id AS id FROM lesson_programs GROUP BY program_id HAVING COUNT(*) > 0 LIMIT 1',
		);
		if (!prog) return s.skip('thiếu dữ liệu');
		const [linked] = await q(
			'SELECT lesson_id FROM lesson_programs WHERE program_id = @p LIMIT 1',
			{
				p: prog.id,
			},
		);
		const fresh = await q(
			`SELECT id FROM program_lessons pl WHERE NOT EXISTS (
			   SELECT 1 FROM lesson_programs lp WHERE lp.lesson_id = pl.id AND lp.program_id = @p) LIMIT 2`,
			{ p: prog.id },
		);
		if (fresh.length < 2) return s.skip('thiếu bài chưa gắn');
		const [{ m }] = await q(
			'SELECT COALESCE(MAX(display_order), -1) AS m FROM lesson_programs WHERE program_id = @p',
			{ p: prog.id },
		);
		const res = await lessonService.linkLessons(
			prog.id,
			[linked.lesson_id, fresh[0].id, 'KHONG_TON_TAI', fresh[1].id, fresh[0].id],
			actor,
		);
		assert.deepEqual(res, { linked: 3 });
		const r = await q(
			`SELECT lesson_id, display_order, id FROM lesson_programs
			 WHERE program_id = @p AND lesson_id IN (@a, @b) ORDER BY display_order`,
			{ p: prog.id, a: fresh[0].id, b: fresh[1].id },
		);
		assert.deepEqual(
			r.map((x) => [x.lesson_id, x.display_order]),
			[
				[fresh[0].id, m + 1],
				[fresh[1].id, m + 3],
			],
		);
		assert.ok(
			r.every((x) => /^LP[0-9A-F]{18}$/.test(x.id)),
			r.map((x) => x.id).join(','),
		);
	});

	await t.test('setProgramTraineeTypes: display_order = vị trí trong mảng', async (s) => {
		const [prog] = await q('SELECT id FROM training_programs LIMIT 1');
		const tts = await q('SELECT id FROM trainee_types ORDER BY id LIMIT 2');
		if (!prog || tts.length < 2) return s.skip('thiếu dữ liệu');
		await setProgramTraineeTypes(prog.id, [tts[1].id, 'KHONG_TON_TAI', tts[0].id]);
		const r = await q(
			'SELECT trainee_type_id, display_order FROM program_trainee_types WHERE program_id = @p ORDER BY display_order',
			{ p: prog.id },
		);
		assert.deepEqual(
			r.map((x) => [x.trainee_type_id, x.display_order]),
			[
				[tts[1].id, 0],
				[tts[0].id, 2],
			],
		);
		await setProgramTraineeTypes(prog.id, []);
		assert.equal(
			(await q('SELECT 1 FROM program_trainee_types WHERE program_id = @p', { p: prog.id })).length,
			0,
		);
	});

	await t.test(
		'setPrograms (khóa học): gỡ chương trình bỏ chọn, gắn chương trình mới',
		async (s) => {
			const [link] = await q('SELECT course_id, program_id FROM course_programs LIMIT 1');
			if (!link) return s.skip('thiếu dữ liệu');
			const [other] = await q(
				`SELECT id FROM training_programs tp WHERE NOT EXISTS (
			   SELECT 1 FROM course_programs cp WHERE cp.course_id = @c AND cp.program_id = tp.id) LIMIT 1`,
				{ c: link.course_id },
			);
			if (!other) return s.skip('thiếu chương trình chưa gắn');
			// setPrograms chạy trên tx của nơi gọi (D1: create / update truyền transaction của câu ghi courses)
			await setPrograms(tx, link.course_id, [other.id, 'KHONG_TON_TAI'], actor);
			const r = await q('SELECT program_id FROM course_programs WHERE course_id = @c', {
				c: link.course_id,
			});
			assert.deepEqual(ids(r, 'program_id'), [other.id]);
		},
	);

	await t.test('schedule (vòng GPHN): 1 câu UPDATE ngày cho cả lịch', async (s) => {
		const [row] = await q(
			`SELECT er.enrollment_id FROM enrollment_rotations er
			 WHERE er.result = 'pending' GROUP BY er.enrollment_id LIMIT 1`,
		);
		if (!row) return s.skip('thiếu vòng chưa có kết quả');
		const res = await rotationService.schedule(row.enrollment_id, '2031-03-02', actor);
		if (!res.scheduled) return s.skip('chương trình thiếu thời lượng vòng');
		const r = await q(
			`SELECT to_char(start_date, 'YYYY-MM-DD') AS s, to_char(end_date, 'YYYY-MM-DD') AS e, updated_by
			 FROM enrollment_rotations WHERE enrollment_id = @e AND result = 'pending' AND start_date >= '2031-03-02'
			 ORDER BY start_date`,
			{ e: row.enrollment_id },
		);
		assert.equal(r.length, res.scheduled);
		assert.equal(r[0].s, '2031-03-02');
		assert.ok(r.every((x) => x.updated_by === actor && x.e >= x.s));
	});

	await t.test('transfer (danh sách chờ): 1 câu UPDATE cho hồ sơ còn chỗ', async (s) => {
		const courses = await q('SELECT id FROM courses ORDER BY created_at DESC LIMIT 30');
		for (const c of courses) {
			const groups = await waitlistService.listCandidates(c.id);
			const g = groups.find((x) => x.room === null || x.room > 0);
			if (!g) continue;
			const cand = g.candidates[0];
			const res = await waitlistService.transfer(c.id, [cand.id], actor);
			assert.equal(res.moved, 1);
			const [e] = await q(
				'SELECT course_id, status, updated_by FROM course_enrollments WHERE id = @id',
				{
					id: cand.id,
				},
			);
			assert.deepEqual(e, { course_id: c.id, status: 'approved', updated_by: actor });
			return;
		}
		return s.skip('không có hồ sơ chờ chuyển được');
	});
});
