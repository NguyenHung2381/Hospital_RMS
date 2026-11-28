// Webhook ngân hàng báo giao dịch học phí (/api/v1/bank-webhooks/:provider) là route công khai:
// chỉ nhận khi bộ chuyển đổi đang bật, phân hệ đang bật, IP cho phép (nếu cấu hình) và chữ
// ký HMAC đúng trên body thô, timestamp không quá cũ. Chạy app thật trên CSDL giả; phần ghi
// giao dịch (bankReconcileService.ingest) được thay để chỉ ghi lại lời gọi.
process.env.JWT_SECRET = 'test-secret-bankwebhook-0123456789abcdef';
require('../../scripts/lib/static-check-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

install(async () => []);

const settings = require('../../src/modules/settings/systemSettingService');
let flags = {};
settings.getValue = async (key, fallback) => (key in flags ? flags[key] : fallback);

const reconcile = require('../../src/modules/training/tuition/bank/bankReconcileService');
const calls = [];
reconcile.ingest = async (provider, txns) => {
	calls.push({ provider, txns });
	return { received: txns.length };
};

const { sign } = require('../../src/modules/training/tuition/bank/providers/generic');
const app = require('../../src/app');

const SECRET = 'khoa-bi-mat-thu-nghiem-0123456789';
const ON = {
	TUITION_BANK_API_PROVIDER: 'generic',
	TUITION_BANK_API_SECRET: SECRET,
};

let srv;
let base;
test.before(async () => {
	srv = app.listen(0, '127.0.0.1');
	await new Promise((r) => srv.once('listening', r));
	base = `http://127.0.0.1:${srv.address().port}/api/v1/bank-webhooks`;
});
test.after(() => srv.close());
test.beforeEach(() => {
	flags = { ...ON };
	calls.length = 0;
});

const BODY = JSON.stringify({
	transactions: [{ id: 'FT1', amount: 1500000, content: 'HP DK202611050001', type: 'credit' }],
});

const post = async (
	path,
	{ body = BODY, ts = Math.floor(Date.now() / 1000), secret = SECRET, sig } = {},
) => {
	const res = await fetch(base + path, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-bank-timestamp': String(ts),
			'x-bank-signature': sig ?? sign(secret, String(ts), body),
		},
		body,
	});
	return { status: res.status, json: await res.json().catch(() => ({})) };
};

test('chữ ký đúng ⇒ nhận, chuyển giao dịch đã parse cho lõi đối soát', async () => {
	const r = await post('/generic');
	assert.equal(r.status, 200);
	assert.equal(r.json.data.received, 1);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].provider, 'generic');
	assert.equal(calls[0].txns[0].external_id, 'FT1');
	assert.equal(calls[0].txns[0].direction, 'credit');
});

test('sai khóa bí mật / sửa body sau khi ký / thiếu chữ ký ⇒ 401, không ghi gì', async () => {
	assert.equal((await post('/generic', { secret: 'khoa-khac-0123456789abcdef' })).status, 401);
	const ts = Math.floor(Date.now() / 1000);
	const tampered = BODY.replace('1500000', '9500000');
	assert.equal(
		(await post('/generic', { body: tampered, ts, sig: sign(SECRET, String(ts), BODY) })).status,
		401,
	);
	assert.equal((await post('/generic', { sig: '' })).status, 401);
	assert.equal(calls.length, 0);
});

test('timestamp cũ hơn 5 phút (gửi lại request cũ) ⇒ 401', async () => {
	const r = await post('/generic', { ts: Math.floor(Date.now() / 1000) - 600 });
	assert.equal(r.status, 401);
	assert.equal(calls.length, 0);
});

test('chưa bật kết nối / bộ chuyển đổi khác / chưa có khóa bí mật ⇒ không nhận', async () => {
	flags.TUITION_BANK_API_PROVIDER = '';
	assert.equal((await post('/generic')).status, 404);
	flags = { ...ON };
	assert.equal((await post('/khong-co')).status, 404);
	flags.TUITION_BANK_API_SECRET = '';
	assert.equal((await post('/generic')).status, 401);
	assert.equal(calls.length, 0);
});

test('IP ngoài danh sách cho phép ⇒ 403; trong danh sách ⇒ nhận', async () => {
	flags.TUITION_BANK_API_ALLOWED_IPS = '203.0.113.0/24';
	assert.equal((await post('/generic')).status, 403);
	flags.TUITION_BANK_API_ALLOWED_IPS = '127.0.0.1';
	assert.equal((await post('/generic')).status, 200);
	assert.equal(calls.length, 1);
});

test('tắt phân hệ Thu học phí ⇒ 403 MODULE_DISABLED', async () => {
	flags.MODULE_TUITION = 'false';
	const r = await post('/generic');
	assert.equal(r.status, 403);
	assert.equal(r.json.code, 'MODULE_DISABLED');
	assert.equal(calls.length, 0);
});

test('body không phải JSON / quá nhiều giao dịch ⇒ 400', async () => {
	assert.equal((await post('/generic', { body: 'khong-phai-json' })).status, 400);
	const many = JSON.stringify({
		transactions: Array.from({ length: 501 }, (_, i) => ({ id: `T${i}`, amount: 1, content: '' })),
	});
	assert.equal((await post('/generic', { body: many })).status, 400);
	assert.equal(calls.length, 0);
});
