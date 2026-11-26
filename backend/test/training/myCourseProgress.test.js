// Cổng học viên — chi tiết khóa (portalService.getMyCourse): mỗi bài kèm tiến độ
// của chính lượt ghi danh (enrollment_lessons + số buổi có mặt) và kết quả cả khóa,
// cho tab "Chương trình". Chưa được duyệt thì không lộ bài / tiến độ / điểm.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');
const db = require('../../src/config/db');

let handler = () => [];
const log = install(async (text, inputs) => handler(text, inputs));
db.queryAll = async (req, statements) => {
	const out = [];
	for (const s of statements) out.push((await req.query(s)).recordset);
	return out;
};
const examService = require('../../src/modules/training/exams/examService');
const practiceResultService = require('../../src/modules/training/courses/practiceResultService');
examService.listAvailablePapersForUser = async () => [];
practiceResultService.listForTrainee = async () => [];
const { getMyCourse, mergeLessonProgress } = require('../../src/modules/portal/portalService');

const COURSE = {
	id: 'KH1',
	name: 'Hồi sức cấp cứu',
	status: 'ongoing',
	enrollment_id: 'GD1',
	enrollment_status: 'approved',
	start_date: '2026-11-01',
	end_date: '2026-12-31',
};
const LESSONS = [
	{
		program_id: 'CT1',
		program_name: 'HSCC',
		id: 'B1',
		code: 'HSCC-01',
		title: 'Đánh giá ban đầu',
		credits: 2,
	},
	{ program_id: 'CT1', program_name: 'HSCC', id: 'B2', code: 'HSCC-02', title: 'BLS', credits: 3 },
];

const route = (course) => (text) => {
	if (/FROM course_enrollments e\s+JOIN trainees t/.test(text) && /c\.is_rolling/.test(text))
		return [course];
	if (/-- Bài học:/.test(text)) return LESSONS;
	if (/FROM enrollment_lessons el/.test(text))
		return [
			{
				lesson_id: 'B1',
				status: 'done',
				completed_at: '2026-11-10',
				session_count: '4',
				attended_count: '4',
			},
		];
	if (/FROM grades g WHERE g\.enrollment_id = @eid/.test(text))
		return [{ theory_score: 8.5, practice_score: 9, result: 'pass', locked: '1' }];
	return [];
};

test('getMyCourse: bài kèm tiến độ của hồ sơ, bài chưa có trong hồ sơ để trống; kèm kết quả khóa', async () => {
	handler = route(COURSE);
	const from = log.length;
	const r = await getMyCourse('KH1', { id: 'U1' });
	const [b1, b2] = r.lessons;
	assert.equal(b1.progress_status, 'done');
	assert.equal(b1.session_count, 4);
	assert.equal(b1.attended_count, 4);
	assert.equal(b2.progress_status, null);
	assert.equal(b2.session_count, 0);
	assert.deepEqual(r.grade, { theory_score: 8.5, practice_score: 9, result: 'pass', locked: true });
	// Tiến độ lấy theo đúng lượt ghi danh của học viên
	const q = log.slice(from).find((x) => /FROM enrollment_lessons el/.test(x.text));
	assert.equal(q.inputs.eid, 'GD1');
});

test('getMyCourse: đăng ký chưa duyệt ⇒ không truy vấn tiến độ / điểm', async () => {
	handler = route({ ...COURSE, enrollment_status: 'pending' });
	const from = log.length;
	const r = await getMyCourse('KH1', { id: 'U1' });
	assert.deepEqual(r.lessons, []);
	assert.equal(r.grade, null);
	assert.equal(
		log.slice(from).some((x) => /FROM enrollment_lessons el|FROM grades g/.test(x.text)),
		false,
	);
});

test('mergeLessonProgress: số đếm từ CSDL (chuỗi) đổi sang số', () => {
	const [l] = mergeLessonProgress(
		[{ id: 'B1' }],
		[{ lesson_id: 'B1', status: 'in_progress', session_count: '5', attended_count: '3' }],
	);
	assert.equal(l.session_count, 5);
	assert.equal(l.attended_count, 3);
	assert.equal(l.progress_status, 'in_progress');
});
