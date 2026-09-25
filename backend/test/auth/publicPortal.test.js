// Cổng công khai: captcha dùng 1 lần; tra cứu cần CCCD + ngày sinh, có giới
// hạn theo từng CCCD; đăng ký khoá học đối chiếu ngày sinh với hồ sơ đã có.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('./fakeDb');

const TRAINEE = { id: 'HV1', national_id: '040200001234', dob: new Date('2000-05-15T00:00:00Z') };
const log = install(async (text, inputs) => {
	if (/FROM trainees t\s+JOIN course_enrollments/.test(text)) {
		const d = inputs.dob;
		return inputs.national_id === TRAINEE.national_id && d === '2000-05-15' ? [{ full_name: 'A' }] : [];
	}
	if (/SELECT TOP 1 \* FROM trainees WHERE national_id/.test(text))
		return inputs.national_id === TRAINEE.national_id ? [TRAINEE] : [];
	return [];
});
const courseService = require('../../src/services/courseService');
courseService.getById = async () => ({ id: 'KH1', status: 'open', enrollment_open: true });
courseService.registerTrainee = async () => ({ id: 'GD1' });
require('../../src/services/traineeService').create = async () => ({ id: 'HV-NEW' });

const { generateCaptcha, verifyCaptcha } = require('../../src/utils/captcha');
const portal = require('../../src/services/publicPortalService');
const attempts = require('../../src/utils/attemptLimiter');

const answerOf = (q) => q.question.match(/\d+/g).map(Number).reduce((a, b) => a + b);

test('captcha: đúng thì qua, nhưng chỉ dùng được 1 lần', async () => {
	const c = generateCaptcha();
	assert.equal(await verifyCaptcha(c.token, answerOf(c)), true);
	assert.equal(await verifyCaptcha(c.token, answerOf(c)), false);
});

test('captcha: trả lời sai cũng làm mất hiệu lực token', async () => {
	const c = generateCaptcha();
	assert.equal(await verifyCaptcha(c.token, answerOf(c) + 1), false);
	assert.equal(await verifyCaptcha(c.token, answerOf(c)), false);
});

test('tra cứu: sai ngày sinh thì như không có dữ liệu', async () => {
	assert.equal((await portal.lookupResults(TRAINEE.national_id, '2000-05-16')).length, 0);
	assert.equal((await portal.lookupResults(TRAINEE.national_id, '2000-05-15')).length, 1);
});

test('giới hạn theo khoá: quá số lần thì bị chặn dù đổi IP', async () => {
	const results = [];
	for (let i = 0; i < 6; i++) results.push(await attempts.hit('test-lookup', '012345678901', 5, 3600));
	assert.deepEqual(results, [true, true, true, true, true, false]);
	assert.equal(await attempts.hit('test-lookup', '999999999999', 5, 3600), true); // CCCD khác không ảnh hưởng
});

test('đăng ký: CCCD đã có hồ sơ mà sai ngày sinh thì bị từ chối', async () => {
	await assert.rejects(
		portal.register({ course_id: 'KH1', full_name: 'X', national_id: TRAINEE.national_id, dob: '1999-01-01' }),
		(e) => e.statusCode === 409,
	);
	const ok = await portal.register({ course_id: 'KH1', full_name: 'X', national_id: TRAINEE.national_id, dob: '2000-05-15' });
	assert.equal(ok.trainee_id, 'HV1');
	assert.ok(log.length > 0);
});
