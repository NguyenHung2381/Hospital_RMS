// L-02: đặt lại mật khẩu không được xóa bộ đếm sai / khóa tài khoản khi tài khoản bật
// TOTP. failed_login_count/locked_until dùng chung cho sai mật khẩu và sai mã TOTP và là
// lớp duy nhất chặn dò mã 6 số từ nhiều IP; kẻ chiếm được hộp thư mà xóa được nó mỗi vòng
// reset thì có thêm 5 lượt đoán mỗi vòng. Tài khoản không bật TOTP vẫn được xóa như cũ.
const os = require('os');
const path = require('path');
const fs = require('fs');
process.env.SECRETS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-reset-totp-'));

const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const LOCK = new Date(Date.now() + 15 * 60_000).toISOString();
const users = {
	U1: { id: 'U1', username: 'NVA_0001', full_name: 'A', email: 'a@bv.vn', totp_enabled: true },
	U2: { id: 'U2', username: 'TTB_0002', full_name: 'B', email: 'b@bv.vn', totp_enabled: false },
};
const state = {}; // id → { failed_login_count, locked_until, password }
const otps = new Map();

const reset = () => {
	for (const id of Object.keys(users))
		state[id] = { failed_login_count: 5, locked_until: LOCK, password: 'old' };
};

// Mô phỏng UPDATE users của resetPassword theo ĐÚNG nội dung câu SQL: bản vô điều kiện
// (= 0 / = NULL) xóa hết; bản CASE WHEN totp_enabled chỉ xóa khi tài khoản không bật TOTP.
// Dạng SQL khác (không nhận ra) → ném lỗi để test không âm thầm qua.
const applyUpdate = (text, inputs) => {
	const u = users[inputs.id];
	const s = state[inputs.id];
	const countKeep =
		/failed_login_count = CASE WHEN totp_enabled THEN failed_login_count ELSE 0 END/.test(text);
	const lockKeep = /locked_until = CASE WHEN totp_enabled THEN locked_until ELSE NULL END/.test(
		text,
	);
	const countZero = /failed_login_count = 0\b/.test(text);
	const lockNull = /locked_until = NULL/.test(text);
	assert.ok(countKeep || countZero, 'không nhận ra cách đặt failed_login_count');
	assert.ok(lockKeep || lockNull, 'không nhận ra cách đặt locked_until');
	if (countZero || !u.totp_enabled) s.failed_login_count = 0;
	if (lockNull || !u.totp_enabled) s.locked_until = null;
	s.password = inputs.password;
	otps.delete(inputs.id);
};

install(async (text, inputs) => {
	if (/WHERE email = @login/.test(text))
		return Object.values(users).filter((u) => u.email === inputs.login);
	if (/WHERE username = @login/.test(text))
		return Object.values(users).filter((u) => u.username === inputs.login);
	if (/UPDATE users SET password = @password/.test(text)) return (applyUpdate(text, inputs), []);
	if (/UPDATE password_reset_otps SET attempts = attempts \+ 1/.test(text)) {
		const o = otps.get(inputs.id);
		return o ? [{ id: inputs.id, code_hash: o.code_hash }] : [];
	}
	if (/FROM security_events/.test(text)) return [{ n: 0 }];
	return [];
});

require('../../src/modules/settings/systemSettingService').getValue = async () => 'true';
require('../../src/modules/auth/sessionVersion').bumpTokenVersion = async () => {};
const secretBox = require('../../src/utils/secretBox');
const svc = require('../../src/modules/auth/passwordResetService');

const doReset = async (login, id) => {
	otps.set(id, { code_hash: secretBox.keyedHash('123456') });
	await svc.resetPassword(login, '123456', 'Matkhau#2026x');
};

test('tài khoản bật TOTP: đặt lại mật khẩu giữ nguyên bộ đếm sai và khóa đang có', async () => {
	reset();
	await doReset('a@bv.vn', 'U1');
	assert.equal(state.U1.password.length > 3, true); // mật khẩu vẫn được đổi
	assert.equal(state.U1.failed_login_count, 5);
	assert.equal(state.U1.locked_until, LOCK);
});

test('tài khoản bật TOTP: nhiều vòng reset liên tiếp vẫn không gỡ được khóa (không thêm lượt đoán TOTP)', async () => {
	reset();
	for (let i = 0; i < 4; i++) await doReset('NVA_0001', 'U1');
	assert.equal(state.U1.failed_login_count, 5);
	assert.equal(state.U1.locked_until, LOCK);
});

test('tài khoản không bật TOTP: đặt lại mật khẩu vẫn xóa bộ đếm và khóa như cũ', async () => {
	reset();
	await doReset('b@bv.vn', 'U2');
	assert.equal(state.U2.failed_login_count, 0);
	assert.equal(state.U2.locked_until, null);
	assert.notEqual(state.U2.password, 'old');
});
