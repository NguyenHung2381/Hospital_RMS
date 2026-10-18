// Xoay refresh token + phát hiện dùng lại (sessionTokenService.refreshAccessToken) với
// bảng refresh_tokens giả lập trong bộ nhớ (test/auth/fakeDb.js).
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./fakeAuthDb');

const { user: USER, rows, events } = setup();
const authService = require('../../src/modules/auth/authService');
const sessionTokenService = require('../../src/modules/auth/sessionTokenService');

const login = async (remember = false) =>
	(await authService.login('nva', 'Dung#matkhau2026', '10.0.0.1', 'test', null, remember))
		.refresh_token;
const rowOf = (hashOf) => rows.find((r) => r.token === hashOf);
const hash = (t) => require('crypto').createHash('sha256').update(t).digest('hex');

test('làm mới: phát token mới cùng họ, token cũ bị đánh dấu thu hồi (không xoá)', async () => {
	const rt1 = await login();
	const { refresh_token: rt2, access_token } = await sessionTokenService.refreshAccessToken(rt1);
	assert.ok(access_token);
	assert.notEqual(rt2, rt1);
	assert.ok(rowOf(hash(rt1)).revoked_at);
	assert.equal(rowOf(hash(rt2)).family_id, rowOf(hash(rt1)).family_id);
});

test('"ghi nhớ đăng nhập" được giữ qua các lần làm mới', async () => {
	const rt1 = await login(true);
	const r = await sessionTokenService.refreshAccessToken(rt1);
	assert.equal(r.remember, true);
	assert.ok(rowOf(hash(r.refresh_token)).remember_me);
});

test('2 request cùng lúc với 1 token: chỉ 1 thành công, bên kia nhận REFRESH_RACE', async () => {
	const rt1 = await login();
	const results = await Promise.allSettled([
		sessionTokenService.refreshAccessToken(rt1),
		sessionTokenService.refreshAccessToken(rt1),
	]);
	assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
	assert.equal(results.find((x) => x.status === 'rejected').reason.code, 'REFRESH_RACE');
});

test('token đã xoay bị dùng lại sau thời gian chờ: thu hồi cả họ + mọi access token', async () => {
	const rt1 = await login();
	const { refresh_token: rt2 } = await sessionTokenService.refreshAccessToken(rt1);
	const family = rowOf(hash(rt1)).family_id;
	rowOf(hash(rt1)).revoked_at = new Date(Date.now() - 5 * 60 * 1000); // bị đánh cắp, dùng sau 5 phút
	const versionBefore = USER.token_version;

	await assert.rejects(
		sessionTokenService.refreshAccessToken(rt1),
		(e) => e.statusCode === 401 && !e.code,
	);
	assert.equal(rows.filter((r) => r.family_id === family).length, 0);
	assert.equal(USER.token_version, versionBefore + 1);
	assert.ok(events.some((e) => e.eventType === 'refresh_token_reuse'));
	// Token mới nhất của họ đó cũng mất hiệu lực
	await assert.rejects(sessionTokenService.refreshAccessToken(rt2), (e) => e.statusCode === 401);
});

test('token rác / ký sai khoá bị từ chối', async () => {
	await assert.rejects(sessionTokenService.refreshAccessToken('abc'), (e) => e.statusCode === 401);
});
