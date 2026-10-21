// Ghi danh theo chương trình: khóa có nhiều chương trình ⇒ phải chọn 1, khóa chỉ
// có 1 ⇒ tự gán, khóa chưa gán chương trình ⇒ ghi danh trơn.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const log = install(async (text) =>
	/INSERT INTO course_enrollments/.test(text) ? [{ id: 'DK1' }] : [],
);
const courseService = require('../../src/modules/training/courses/courseService');
let programIds = [];
courseService.getById = async () => ({ id: 'KH1', enrollment_open: true, program_ids: programIds });
const enrollmentProgramService = require('../../src/modules/training/courses/enrollmentProgramService');
enrollmentProgramService.assertProgramInCourse = async () => {};
enrollmentProgramService.syncLessons = async () => ({ added: 0 });
const svc = require('../../src/modules/training/courses/courseEnrollmentService');

const insertedProgram = () =>
	log.filter((l) => /INSERT INTO course_enrollments/.test(l.text)).at(-1).inputs.program_id;

test('khóa nhiều chương trình mà không chọn ⇒ 400', async () => {
	programIds = ['CT1', 'CT2'];
	await assert.rejects(svc.registerTrainee('KH1', 'HV1', null), (e) => e.statusCode === 400);
	await svc.registerTrainee('KH1', 'HV1', null, { programId: 'CT2' });
	assert.equal(insertedProgram(), 'CT2');
});

test('khóa 1 chương trình ⇒ tự gán', async () => {
	programIds = ['CT1'];
	await svc.registerTrainee('KH1', 'HV1', null);
	assert.equal(insertedProgram(), 'CT1');
});

test('khóa chưa gán chương trình ⇒ ghi danh không chương trình', async () => {
	programIds = [];
	await svc.registerTrainee('KH1', 'HV1', null);
	assert.equal(insertedProgram(), null);
});
