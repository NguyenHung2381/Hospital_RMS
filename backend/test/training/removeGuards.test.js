// Chặn xóa lượt ghi danh / khóa học đã cấp giấy chứng nhận hoặc đã có CME tự động
// (TT 32/2023/TT-BYT Điều 9.4) — CSDL giả, khớp theo đoạn SQL.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

// world: giả lập nội dung CSDL; DELETE chỉ "xóa được" (trả 1 dòng) khi không bị chặn
const world = { enrollCert: false, courseCert: false, courseCme: false };
const log = install(async (text) => {
	if (/^\s*DELETE FROM course_enrollments/.test(text)) return world.enrollCert ? [] : [{}];
	if (/SELECT 1 AS x FROM certificates WHERE enrollment_id/.test(text))
		return world.enrollCert ? [{ x: 1 }] : [];
	if (/^\s*DELETE FROM courses/.test(text)) return world.courseCert || world.courseCme ? [] : [{}];
	if (/AS has_cert/.test(text))
		return [{ has_cert: world.courseCert ? 1 : 0, has_cme: world.courseCme ? 1 : 0 }];
	if (/FROM course_enrollments e JOIN courses c/.test(text))
		return [{ program_id: null, course_id: 'KH1', status: 'pending' }];
	return [];
});
const enrollments = require('../../src/modules/training/courses/courseEnrollmentService');
const courses = require('../../src/modules/training/courses/courseService');
require('../../src/modules/forms/formCustomValueService').remove = async () => {};

const has = (re) => log.some((l) => re.test(l.text));
const reset = (over) => {
	Object.assign(world, { enrollCert: false, courseCert: false, courseCme: false }, over);
	log.length = 0;
};

test('xóa lượt ghi danh chưa có giấy ⇒ xóa được', async () => {
	reset({});
	await enrollments.removeEnrollment('DK1', 'U1');
	assert.ok(has(/DELETE FROM course_enrollments/));
	assert.ok(has(/COMMIT/));
});

test('xóa lượt ghi danh đã cấp giấy ⇒ 409, transaction rollback', async () => {
	reset({ enrollCert: true });
	await assert.rejects(
		enrollments.removeEnrollment('DK1', 'U1'),
		(e) => e.statusCode === 409 && /đã được cấp giấy chứng nhận.*thu hồi/.test(e.message),
	);
	assert.ok(has(/ROLLBACK/));
	assert.ok(!has(/COMMIT/));
});

test('xóa khóa chưa có giấy / CME ⇒ xóa được', async () => {
	reset({});
	await courses.remove('KH1', 'U1');
	assert.ok(has(/DELETE FROM courses/));
});

test('xóa khóa đã cấp giấy ⇒ 409', async () => {
	reset({ courseCert: true });
	await assert.rejects(
		courses.remove('KH1', 'U1'),
		(e) => e.statusCode === 409 && /đã cấp giấy chứng nhận/.test(e.message),
	);
});

test('xóa khóa đã có CME tự động ⇒ 409', async () => {
	reset({ courseCme: true });
	await assert.rejects(
		courses.remove('KH1', 'U1'),
		(e) => e.statusCode === 409 && /CME tự động/.test(e.message),
	);
});
