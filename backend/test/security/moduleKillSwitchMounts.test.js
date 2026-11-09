// Hồi quy L-04 (phần còn sót): công tắc MODULE_<KEY> chưa phủ /files (file đề tài), /research-rounds
// (gắn ở gốc API) và /dashboard/training-stats, /dashboard/seminar-stats. Chạy app thật trên
// CSDL giả, người dùng có đủ quyền: tắt module ⇒ 403 MODULE_DISABLED; bật ⇒ qua công tắc.
process.env.JWT_SECRET = 'test-secret-killswitch-0123456789abcdef';
require('../../scripts/lib/static-check-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const PERMS = [
	{ resource: 'files', action: 'delete', scope: 'all' },
	{ resource: 'rounds', action: 'read', scope: 'all' },
	{ resource: 'rounds', action: 'create', scope: 'all' },
	{ resource: 'reports', action: 'read', scope: 'all' },
];

install(async (text, inputs) => {
	if (/token_version, must_change_password/.test(text)) {
		if (inputs.id !== 'UADM') return [];
		return [
			{
				is_active: true,
				role_id: 'RADM',
				department_id: 'K1',
				account_expires_at: null,
				token_version: 0,
				must_change_password: false,
				temp_password_issued_at: null,
				totp_enabled: false,
				twofa_required_since: null,
			},
		];
	}
	if (/FROM permissions p\s+INNER JOIN role_permissions/.test(text)) return PERMS;
	return [];
});

// Công tắc module đọc từ cấu hình hệ thống: cho test điều khiển trực tiếp.
const settings = require('../../src/modules/settings/systemSettingService');
let flags = {};
settings.getValue = async (key) => flags[key];
const setModules = (off = []) => {
	flags = Object.fromEntries(off.map((k) => [`MODULE_${k}`, 'false']));
};

const { signToken } = require('../../src/utils/keys');
const app = require('../../src/app');

let srv;
let base;
test.before(async () => {
	srv = app.listen(0, '127.0.0.1');
	await new Promise((r) => srv.once('listening', r));
	base = `http://127.0.0.1:${srv.address().port}/api/v1`;
});
test.after(() => srv.close());

const send = async (method, path, body) => {
	const res = await fetch(base + path, {
		method,
		headers: {
			authorization: `Bearer ${signToken('access', { id: 'UADM', tv: 0 }, '1h')}`,
			'content-type': 'application/json',
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const json = await res.json().catch(() => ({}));
	return { status: res.status, code: json.code };
};

const RESEARCH = [
	['DELETE', '/files/F1'],
	['GET', '/research-rounds'],
	['POST', '/research-rounds', {}],
	['GET', '/research-rounds/R1'],
	['PUT', '/research-rounds/R1', {}],
	['DELETE', '/research-rounds/R1'],
	['GET', '/research-rounds/R1/deadlines'],
	['PUT', '/research-rounds/R1/deadlines/register', {}],
	['DELETE', '/research-rounds/R1/deadlines/register'],
];
const TRAINING = [['GET', '/dashboard/training-stats']];
const SEMINAR = [['GET', '/dashboard/seminar-stats']];

const expectDisabled = async (routes) => {
	for (const [m, p, b] of routes) {
		const r = await send(m, p, b);
		assert.equal(r.status, 403, `${m} ${p}`);
		assert.equal(r.code, 'MODULE_DISABLED', `${m} ${p}`);
	}
};

test('tắt RESEARCH: /files và /research-rounds bị chặn', async () => {
	setModules(['RESEARCH']);
	await expectDisabled(RESEARCH);
});

test('tắt TRAINING: /dashboard/training-stats bị chặn', async () => {
	setModules(['TRAINING']);
	await expectDisabled(TRAINING);
});

test('tắt SEMINAR: /dashboard/seminar-stats bị chặn', async () => {
	setModules(['SEMINAR']);
	await expectDisabled(SEMINAR);
});

test('bật hết: các route đi qua công tắc (không còn MODULE_DISABLED)', async () => {
	setModules([]);
	for (const [m, p, b] of [...RESEARCH, ...TRAINING, ...SEMINAR]) {
		const r = await send(m, p, b);
		assert.notEqual(r.code, 'MODULE_DISABLED', `${m} ${p}`);
	}
});

test('cách ly theo module: tắt module khác không chặn route này', async () => {
	setModules(['TRAINING', 'SEMINAR']);
	for (const [m, p, b] of RESEARCH) {
		const r = await send(m, p, b);
		assert.notEqual(r.code, 'MODULE_DISABLED', `${m} ${p}`);
	}
	setModules(['RESEARCH', 'SEMINAR']);
	for (const [m, p, b] of TRAINING) {
		const r = await send(m, p, b);
		assert.notEqual(r.code, 'MODULE_DISABLED', `${m} ${p}`);
	}
	setModules(['RESEARCH', 'TRAINING']);
	for (const [m, p, b] of SEMINAR) {
		const r = await send(m, p, b);
		assert.notEqual(r.code, 'MODULE_DISABLED', `${m} ${p}`);
	}
});
