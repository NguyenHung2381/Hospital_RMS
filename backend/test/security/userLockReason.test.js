// L-08 (run-4), bước gộp nhánh: mọi thao tác quản trị khóa / mở tài khoản phải ghi
// users.deactivated_reason, nếu không lỗi tái diễn qua chuỗi
//   job hết hạn khóa ('expired') → quản trị mở lại → quản trị khóa tay
// (dòng vẫn mang 'expired' ⇒ grantAccounts của chủ nhiệm đề tài mở lại được).
// Quy ước: khóa tay ⇒ 'admin', mở ⇒ NULL; chỉ 'expired' (job) được mở lại tự động.
process.env.LOG_LEVEL = 'silent';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const log = install(async (text) => {
	if (/FROM trainees t\s+JOIN users u/.test(text))
		return [{ user_id: 'U_TR', trainee_active: true, hidden_at: null }];
	return [];
});
// Phụ thuộc phụ — chặn trước khi nạp service (eventService bị destructure lúc require)
require('../../src/modules/events/eventService').broadcast = () => {};
require('../../src/modules/persons/personService').syncPerson = async () => {};
const userService = require('../../src/modules/users/userService');
const traineeAccount = require('../../src/modules/training/trainees/traineeAccountService');

const lastUserUpdate = () => {
	const q = [...log].reverse().find((l) => /UPDATE users SET/.test(l.text));
	assert.ok(q, 'phải có câu UPDATE users');
	return q;
};

for (const [label, value, expected] of [
	['khóa tay (false)', false, 'admin'],
	["khóa tay ('false')", 'false', 'admin'],
	['khóa tay (0)', 0, 'admin'],
	['mở lại (true)', true, null],
	["mở lại ('1')", '1', null],
]) {
	test(`L-08: userService.update ${label} ghi deactivated_reason = ${expected}`, async () => {
		log.length = 0;
		await userService.update('U1', { is_active: value }, 'ADMIN');
		const q = lastUserUpdate();
		assert.match(q.text, /deactivated_reason = @deactivated_reason/);
		assert.equal(q.inputs.deactivated_reason, expected);
	});
}

test('L-08 (đối chứng): update không đổi is_active thì không đụng deactivated_reason', async () => {
	log.length = 0;
	await userService.update('U1', { full_name: 'Nguyễn Văn A' }, 'ADMIN');
	const q = lastUserUpdate();
	assert.doesNotMatch(q.text, /deactivated_reason/);
});

test('L-08: khóa / mở tài khoản học viên cũng ghi lý do khóa', async () => {
	log.length = 0;
	await traineeAccount.setAccountActive('HV1', false, 'ADMIN');
	let q = lastUserUpdate();
	assert.match(q.text, /deactivated_reason = @deactivated_reason/);
	assert.equal(q.inputs.deactivated_reason, 'admin');

	log.length = 0;
	await traineeAccount.setAccountActive('HV1', true, 'ADMIN');
	q = lastUserUpdate();
	assert.equal(q.inputs.deactivated_reason, null);
});
