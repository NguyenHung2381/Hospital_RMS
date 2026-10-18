// Chống IDOR cho khoá học (modules/training/courses/courseService.js): giảng viên phạm vi
// 'assigned' chỉ thao tác khoá học mình được phân công — kể cả qua mã bản ghi
// con (buổi học, đăng ký, tài liệu, điểm, chứng chỉ...).
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

// KH1 phân công cho giảng viên GV1; KH2 thì không
const ASSIGNED = { KH1: ['GV1'], KH2: [] };
const CHILD = {
	'class_sessions:BH1': 'KH1',
	'class_sessions:BH2': 'KH2',
	'course_enrollments:DK2': 'KH2',
	'grades:D2': 'KH2',
	'certificates:CC1': 'KH1',
};
const queries = [];
install(async (text, inputs) => {
	queries.push(text);
	if (/FROM courses c WHERE c\.id = @id AND EXISTS/.test(text)) {
		return (ASSIGNED[inputs.id] || []).includes(inputs.actor_id) ? [{ ok: 1 }] : [];
	}
	const table = (text.match(
		/FROM (class_sessions|course_enrollments|course_documents|course_programs|lecturer_assignments|grades|certificates)/,
	) || [])[1];
	const course = CHILD[`${table}:${inputs.id}`];
	return course ? [{ course_id: course }] : [];
});
const courseService = require('../../src/modules/training/courses/courseService');

const actor = (id, grants) => ({
	id,
	permissions: new Set(Object.keys(grants)),
	permissionScopes: new Map(Object.entries(grants)),
});
const LECTURER = actor('GV1', { 'courses:read': 'assigned', 'courses:update': 'assigned' });
const MANAGER = actor('QL1', { 'courses:read': 'all', 'courses:update': 'all' });

const denied = (p, code = 403) => assert.rejects(p, (e) => e.statusCode === code);

test('giảng viên: khoá được phân công thì qua, khoá khác bị chặn', async () => {
	await courseService.assertCourseInScope('KH1', LECTURER);
	await denied(courseService.assertCourseInScope('KH2', LECTURER));
});

test('giảng viên: mã bản ghi con quy về khoá học chứa nó', async () => {
	await courseService.assertCourseChildInScope('sessionId', 'BH1', LECTURER);
	await courseService.assertCourseChildInScope('certId', 'CC1', LECTURER);
	await denied(courseService.assertCourseChildInScope('sessionId', 'BH2', LECTURER));
	await denied(courseService.assertCourseChildInScope('enrollmentId', 'DK2', LECTURER));
	await denied(courseService.assertCourseChildInScope('gradeId', 'D2', LECTURER));
	await denied(courseService.assertCourseChildInScope('docId', 'KHONG-CO', LECTURER), 404);
});

test('phạm vi toàn viện: không cần tra DB', async () => {
	const before = queries.length;
	await courseService.assertCourseInScope('KH2', MANAGER);
	await courseService.assertCourseChildInScope('gradeId', 'D2', MANAGER);
	assert.equal(queries.length, before);
});

test('mọi tham số mã con trong modules/training/courses/courses.routes.js đều có cách quy về khoá học', () => {
	const src = require('fs').readFileSync(
		require.resolve('../../src/modules/training/courses/courses.routes.js'),
		'utf8',
	);
	const params = new Set([...src.matchAll(/'[^']*\/:([a-zA-Z]+)/g)].map((m) => m[1]));
	for (const p of params) {
		if (p === 'id') continue;
		assert.ok(
			courseService.CHILD_COURSE_SQL[p],
			`route dùng :${p} nhưng chưa có trong CHILD_COURSE_SQL`,
		);
	}
});
