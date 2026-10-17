// Cổng công khai: captcha dùng 1 lần; tra cứu cần CCCD + ngày sinh, có giới
// hạn theo từng CCCD; đăng ký khoá học đối chiếu ngày sinh với hồ sơ đã có.
process.env.JWT_SECRET = 'test-secret';
process.env.CAPTCHA_POW_BITS = '12'; // test giải nhanh
process.env.CAPTCHA_MIN_FILL_SEC = '0';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('./fakeDb');

const TRAINEE = { id: 'HV1', national_id: '040200001234', dob: new Date('2000-05-15T00:00:00Z') };
const log = install(async (text, inputs) => {
	if (/FROM trainees t\s+JOIN course_enrollments/.test(text)) {
		const d = inputs.dob;
		return inputs.national_id === TRAINEE.national_id && d === '2000-05-15'
			? [{ full_name: 'Nguyễn Văn An' }]
			: [];
	}
	if (/SELECT TOP 1 \* FROM trainees WHERE national_id/.test(text))
		return inputs.national_id === TRAINEE.national_id ? [TRAINEE] : [];
	return [];
});
const courseService = require('../../src/services/courseService');
courseService.getById = async () => ({
	id: 'KH1',
	status: 'draft',
	is_public_registration: true,
	enrollment_open: true,
});
courseService.registerTrainee = async () => ({ id: 'GD1' });
require('../../src/services/traineeService').create = async () => ({ id: 'HV-NEW' });

const { generateCaptcha, verifyCaptcha } = require('../../src/utils/captcha');
const portal = require('../../src/services/publicPortalService');
const attempts = require('../../src/utils/attemptLimiter');

const { leadingZeroBits } = require('../../src/utils/loginShield');
const nodeCrypto = require('crypto');
const powOk = (token, nonce, bits) =>
	leadingZeroBits(nodeCrypto.createHash('sha256').update(`${token}:${nonce}`).digest()) >= bits;
const solve = ({ token, bits }) => {
	for (let n = 0; ; n++) if (powOk(token, n.toString(36), bits)) return n.toString(36);
};
const wrongNonce = ({ token, bits }) => {
	for (let n = 0; ; n++) if (!powOk(token, n.toString(36), bits)) return n.toString(36);
};

test('captcha: chế độ mặc định là proof-of-work, không lộ đáp án', () => {
	const c = generateCaptcha();
	assert.equal(c.provider, 'pow');
	assert.equal(c.bits, 12);
	assert.equal(c.question, undefined);
});

test('captcha: giải đúng thì qua, nhưng chỉ dùng được 1 lần', async () => {
	const c = generateCaptcha();
	const nonce = solve(c);
	assert.equal(await verifyCaptcha(c.token, nonce), true);
	assert.equal(await verifyCaptcha(c.token, nonce), false);
});

test('captcha: lời giải sai cũng làm mất hiệu lực token', async () => {
	const c = generateCaptcha();
	assert.equal(await verifyCaptcha(c.token, wrongNonce(c)), false);
	assert.equal(await verifyCaptcha(c.token, solve(c)), false);
});

test('captcha: nonce sai định dạng / token giả → không qua', async () => {
	const c = generateCaptcha();
	assert.equal(await verifyCaptcha(c.token, '../../x'), false);
	assert.equal(await verifyCaptcha(c.token, 12345), false);
	assert.equal(await verifyCaptcha(`${c.token}x`, solve(c)), false);
});

test('tra cứu: sai ngày sinh thì như không có dữ liệu', async () => {
	assert.equal(
		(await portal.lookupResults(TRAINEE.national_id, '2000-05-16', 'Nguyễn Văn An')).length,
		0,
	);
	assert.equal(
		(await portal.lookupResults(TRAINEE.national_id, '2000-05-15', 'Nguyễn Văn An')).length,
		1,
	);
});

test('tra cứu: họ tên phải khớp (bỏ qua hoa/thường, dấu, khoảng trắng thừa)', async () => {
	assert.equal(
		(await portal.lookupResults(TRAINEE.national_id, '2000-05-15', '  nguyen  van AN ')).length,
		1,
	);
	assert.equal(
		(await portal.lookupResults(TRAINEE.national_id, '2000-05-15', 'Nguyễn Văn Bình')).length,
		0,
	);
	assert.equal((await portal.lookupResults(TRAINEE.national_id, '2000-05-15', '')).length, 0);
});

test('giới hạn theo khoá: quá số lần thì bị chặn dù đổi IP', async () => {
	const results = [];
	for (let i = 0; i < 6; i++)
		results.push(await attempts.hit('test-lookup', '012345678901', 5, 3600));
	assert.deepEqual(results, [true, true, true, true, true, false]);
	assert.equal(await attempts.hit('test-lookup', '999999999999', 5, 3600), true); // CCCD khác không ảnh hưởng
});

test('đăng ký: CCCD đã có hồ sơ mà sai ngày sinh thì bị từ chối', async () => {
	await assert.rejects(
		portal.register({
			course_id: 'KH1',
			full_name: 'X',
			national_id: TRAINEE.national_id,
			dob: '1999-01-01',
		}),
		(e) => e.statusCode === 409,
	);
	const ok = await portal.register({
		course_id: 'KH1',
		full_name: 'X',
		national_id: TRAINEE.national_id,
		dob: '2000-05-15',
	});
	assert.equal(ok.trainee_id, 'HV1');
	assert.ok(log.length > 0);
});
