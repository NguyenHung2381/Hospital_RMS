// Khóa lượt thử theo tài khoản (credentialService.withAttemptGuard) với CSDL giả
// có trạng thái: loạt request SONG SONG sai mật khẩu không được vượt ngưỡng khóa
// MAX_FAILED_LOGIN_ATTEMPTS (trước đây mọi request cùng đọc "chưa khóa" lúc đầu
// nên request nào cũng được thử). Áp dụng cho đăng nhập và xác nhận lại mật khẩu.
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { install } = require('./fakeDb');

const HASH = bcrypt.hashSync('Dung#matkhau2026', 4);
const user = {
	id: 'U1',
	username: 'nva',
	password: HASH,
	is_active: 1,
	role_id: null,
	totp_enabled: 0,
	failed_login_count: 0,
	locked_until: null,
};
let failures = 0; // số lần recordFailedLogin chạy

install(async (text, inputs) => {
	// Bản sao: request đọc trạng thái tại thời điểm truy vấn, như CSDL thật
	if (/WHERE u\.username = @login/.test(text))
		return inputs.login === user.username ? [{ ...user }] : [];
	if (/SELECT failed_login_count, locked_until FROM users/.test(text)) return [{ ...user }];
	if (/SELECT id, username, password, failed_login_count, locked_until FROM users/.test(text))
		return [{ ...user }];
	if (/COUNT\(\*\) AS locks/.test(text)) return [{ locks: 0 }];
	if (/OUTPUT DELETED\.failed_login_count/.test(text)) {
		failures++;
		const prev = user.failed_login_count;
		if (prev + 1 >= inputs.max) {
			user.locked_until = new Date(Date.now() + inputs.minutes * 60_000);
			user.failed_login_count = 0;
		} else {
			user.failed_login_count = prev + 1;
		}
		return [{ prev_count: prev, locked_until: user.locked_until }];
	}
	return [];
});
require('../../src/modules/audit/securityEventService').log = async () => {};
const authService = require('../../src/modules/auth/authService');
const { getPool } = require('../../src/config/db');
const { assertPassword } = require('../../src/modules/auth/credentialService');

const reset = () => {
	user.failed_login_count = 0;
	user.locked_until = null;
	failures = 0;
};

test('đăng nhập: 12 request sai cùng lúc chỉ được thử đúng 5 lần, còn lại báo khóa', async () => {
	reset();
	const results = await Promise.all(
		Array.from({ length: 12 }, (_, i) =>
			authService.login('nva', `Sai#matkhau${i}`).catch((e) => e),
		),
	);
	assert.equal(failures, 5);
	const locked = results.filter((e) => e.statusCode === 403 && e.retryAfterSeconds);
	assert.equal(locked.length, 8); // lần thứ 5 làm khóa + 7 lần sau thấy đã khóa
	assert.ok(results.every((e) => e.statusCode === 401 || e.statusCode === 403));
});

test('username không tồn tại: request song song vẫn trả lỗi chung 401', async () => {
	const results = await Promise.all(
		[1, 2, 3].map(() => authService.login('khong_ton_tai', 'Sai#matkhau1').catch((e) => e)),
	);
	assert.ok(results.every((e) => e.statusCode === 401));
});

test('xác nhận lại mật khẩu: sai tính vào bộ đếm khóa, tài khoản đang khóa không thử được', async () => {
	reset();
	const pool = await getPool();
	const results = await Promise.all(
		Array.from({ length: 8 }, (_, i) => assertPassword(pool, 'U1', `Sai#${i}`).catch((e) => e)),
	);
	assert.equal(failures, 5);
	assert.equal(results.filter((e) => e.statusCode === 400).length, 4);
	assert.equal(results.filter((e) => e.statusCode === 403).length, 4);
	// Đang khóa: mật khẩu đúng cũng bị từ chối
	await assert.rejects(assertPassword(pool, 'U1', 'Dung#matkhau2026'), (e) => e.statusCode === 403);
});
