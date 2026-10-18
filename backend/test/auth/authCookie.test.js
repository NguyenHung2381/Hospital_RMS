// Lớp HTTP của /auth: refresh token chỉ đi qua cookie HttpOnly, không bao giờ
// nằm trong body; refresh/logout đọc cookie; chặn Origin lạ. Dựng Express thật
// với modules/auth/auth.routes.js + CSDL giả (test/auth/fakeAuthDb.js).
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.CORS_ORIGIN = 'https://nckh.bvnghean.vn';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { setup } = require('./fakeAuthDb');

const { rows, PASSWORD } = setup();
const app = express();
app.use(express.json());
app.use('/api/v1/auth', require('../../src/modules/auth/auth.routes'));
app.use(require('../../src/middlewares/errorHandler').errorHandler);

let base;
const server = app.listen(0);
test.before(() => {
	base = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
});
test.after(() => server.close());

const post = (path, { body = {}, cookie, origin } = {}) =>
	fetch(`${base}${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(cookie ? { Cookie: cookie } : {}),
			...(origin ? { Origin: origin } : {}),
		},
		body: JSON.stringify(body),
	});
const cookieOf = (res) => res.headers.get('set-cookie') ?? '';
const valueOf = (setCookie) => setCookie.split(';')[0]; // "rms_rt=..."

test('đăng nhập: refresh token trong cookie HttpOnly/SameSite=Strict/Path, không có trong body', async () => {
	const res = await post('/login', { body: { username: 'nva', password: PASSWORD } });
	const json = await res.json();
	assert.equal(res.status, 200);
	assert.ok(json.data.access_token);
	assert.equal(json.data.refresh_token, undefined);
	assert.equal(json.data.remember, undefined);
	const c = cookieOf(res);
	assert.match(c, /^rms_rt=/);
	assert.match(c, /HttpOnly/);
	assert.match(c, /SameSite=Strict/);
	assert.match(c, /Path=\/api\/v1\/auth/);
	assert.doesNotMatch(c, /Max-Age/); // không ghi nhớ = cookie phiên
});

test('ghi nhớ đăng nhập: cookie có hạn 30 ngày', async () => {
	const res = await post('/login', {
		body: { username: 'nva', password: PASSWORD, remember_me: true },
	});
	assert.match(cookieOf(res), /Max-Age=2592000/);
});

test('làm mới bằng cookie: access token mới + cookie mới; cookie cũ dùng lại bị từ chối', async () => {
	const login = await post('/login', { body: { username: 'nva', password: PASSWORD } });
	const c1 = valueOf(cookieOf(login));
	const res = await post('/refresh', { cookie: c1 });
	const json = await res.json();
	assert.equal(res.status, 200);
	assert.ok(json.data.access_token);
	assert.equal(json.data.refresh_token, undefined);
	const c2 = valueOf(cookieOf(res));
	assert.notEqual(c2, c1);
	// Dùng lại ngay (tab khác) → REFRESH_RACE, không xoá cookie
	const race = await post('/refresh', { cookie: c1 });
	assert.equal(race.status, 401);
	assert.equal((await race.json()).code, 'REFRESH_RACE');
});

test('refresh từ Origin lạ bị chặn (CSRF)', async () => {
	const login = await post('/login', { body: { username: 'nva', password: PASSWORD } });
	const res = await post('/refresh', {
		cookie: valueOf(cookieOf(login)),
		origin: 'https://evil.example',
	});
	assert.equal(res.status, 403);
});

test('không có cookie → 401', async () => {
	assert.equal((await post('/refresh')).status, 401);
});

test('đăng xuất: xoá cả họ token trên server và xoá cookie', async () => {
	const login = await post('/login', { body: { username: 'nva', password: PASSWORD } });
	const c1 = valueOf(cookieOf(login));
	const before = rows.length;
	const res = await post('/logout', { cookie: c1 });
	assert.equal(res.status, 200);
	assert.match(cookieOf(res), /rms_rt=;.*Expires=Thu, 01 Jan 1970/);
	assert.equal(rows.length, before - 1);
	assert.equal((await post('/refresh', { cookie: c1 })).status, 401);
});
