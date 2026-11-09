// Hồi quy M-04 (audit run-4): người có seminars:update nhưng không có seminars:cme_manage không
// được ghi trực tiếp số quyết định / năm / trạng thái / ngày cấp CME, đổi số tín chỉ hay chuyển
// người nhận trên dòng đã có số CME, hoặc đổi trạng thái CME hàng loạt (bulk-cme).
// Chạy router + authorizePermission + controller + service thật trên CSDL giả.
process.env.JWT_SECRET = 'test-secret';
require('../../scripts/lib/static-check-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const ROLES = {
	// ban tổ chức: sửa hội thảo, KHÔNG có cme_manage
	RORG: [
		{ resource: 'seminars', action: 'read', scope: 'all' },
		{ resource: 'seminars', action: 'update', scope: 'all' },
	],
	// như vai trò seed: có cả seminars:cme_manage
	RCME: [
		{ resource: 'seminars', action: 'read', scope: 'all' },
		{ resource: 'seminars', action: 'update', scope: 'all' },
		{ resource: 'seminars', action: 'cme_manage', scope: 'all' },
	],
};
const USERS = { UORG: 'RORG', UCME: 'RCME' };
// SPT_ISSUED đã có số CME, SPT_FREE chưa cấp
const PARTICIPANTS = {
	SPT_ISSUED: { id: 'SPT_ISSUED', cme_seq: 12, cme_credits: 6, user_id: 'U_OWNER' },
	SPT_FREE: { id: 'SPT_FREE', cme_seq: null, cme_credits: null, user_id: null },
};

const log = install(async (text, inputs) => {
	if (/token_version, must_change_password/.test(text)) {
		const role = USERS[inputs.id];
		if (!role) return [];
		return [
			{
				is_active: true,
				role_id: role,
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
	if (/FROM permissions p\s+INNER JOIN role_permissions/.test(text))
		return ROLES[inputs.role_id] || [];
	if (/SELECT id, code FROM roles/.test(text)) return [{ id: 'VT10', code: 'trainee' }];
	if (/SELECT id, event_year, cme_default_credits FROM seminars/.test(text))
		return [{ id: 'SEM1', event_year: 2026, cme_default_credits: 6 }];
	if (/SELECT cme_seq, cme_credits, user_id FROM seminar_participants/.test(text))
		return PARTICIPANTS[inputs.pid] ? [PARTICIPANTS[inputs.pid]] : [];
	if (/SELECT \* FROM seminar_participants/.test(text))
		return [PARTICIPANTS[inputs.pid || inputs.id] || { id: inputs.id }];
	return [];
});
require('../../src/modules/persons/personService').syncPerson = async () => {};
require('../../src/modules/persons/personService').syncPersons = async () => {};

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

const call = async (who, method, path, body) => {
	const n = log.length;
	const res = await fetch(base + path, {
		method,
		headers: {
			authorization: `Bearer ${signToken('access', { id: who, tv: 0 }, '1h')}`,
			'content-type': 'application/json',
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	return { status: res.status, entries: log.slice(n) };
};
const insertOf = (entries) => entries.find((e) => /INSERT INTO seminar_participants/.test(e.text));
const updateOf = (entries) => entries.find((e) => /UPDATE seminar_participants SET/.test(e.text));
const FORGED = {
	full_name: 'Nguoi Gia Mao',
	user_id: 'VICTIM0001',
	cme_year: 2026,
	cme_seq: 4242,
	cme_credits: 99.9,
	cme_status: 'signed',
	cme_issued_date: '2026-01-01',
};

test('M-04: POST participants không cme_manage → bỏ năm / số / trạng thái / ngày cấp CME khỏi body', async () => {
	const r = await call('UORG', 'POST', '/seminars/SEM1/participants', FORGED);
	assert.equal(r.status, 201);
	const ins = insertOf(r.entries);
	assert.equal(ins.inputs.cme_year, null);
	assert.equal(ins.inputs.cme_seq, null);
	assert.equal(ins.inputs.cme_status, 'none');
	assert.equal(ins.inputs.cme_issued_date, null);
	assert.equal(ins.inputs.full_name, 'Nguoi Gia Mao');
});

test('M-04 đối chứng: POST participants có cme_manage giữ nguyên các trường CME', async () => {
	const r = await call('UCME', 'POST', '/seminars/SEM1/participants', FORGED);
	assert.equal(r.status, 201);
	const ins = insertOf(r.entries);
	assert.equal(ins.inputs.cme_year, 2026);
	assert.equal(ins.inputs.cme_seq, 4242);
	assert.equal(ins.inputs.cme_status, 'signed');
	assert.equal(ins.inputs.cme_credits, 99.9);
});

test('M-04: PUT dòng đã có số CME — đổi tín chỉ hoặc chuyển người nhận → 403, không ghi', async () => {
	let r = await call('UORG', 'PUT', '/seminars/SEM1/participants/SPT_ISSUED', { cme_credits: 50 });
	assert.equal(r.status, 403);
	assert.equal(updateOf(r.entries), undefined);

	r = await call('UORG', 'PUT', '/seminars/SEM1/participants/SPT_ISSUED', {
		user_id: 'BENEFICIARY1',
	});
	assert.equal(r.status, 403);
	assert.equal(updateOf(r.entries), undefined);
});

test('M-04: PUT bỏ qua cme_status / cme_issued_date của người không có cme_manage', async () => {
	// gửi lại đúng giá trị cũ của tín chỉ / người nhận (form luôn gửi cả bộ) → được, nhưng
	// không ghi các cột CME
	const r = await call('UORG', 'PUT', '/seminars/SEM1/participants/SPT_ISSUED', {
		notes: 'ghi chú mới',
		cme_credits: '6',
		user_id: 'U_OWNER',
		cme_status: 'signed',
		cme_issued_date: '2026-01-01',
	});
	assert.equal(r.status, 200);
	const up = updateOf(r.entries);
	assert.match(up.text, /notes = @notes/);
	assert.doesNotMatch(up.text, /cme_credits|cme_issued_date|cme_status|user_id/);
});

test('M-04: PUT dòng chưa cấp CME — vẫn nhập được tín chỉ, ngày cấp CME bị bỏ', async () => {
	const r = await call('UORG', 'PUT', '/seminars/SEM1/participants/SPT_FREE', {
		cme_credits: 5,
		cme_issued_date: '2026-01-01',
	});
	assert.equal(r.status, 200);
	const up = updateOf(r.entries);
	assert.match(up.text, /cme_credits = @cme_credits/);
	assert.equal(up.inputs.cme_credits, 5);
	assert.doesNotMatch(up.text, /cme_issued_date/);
});

test('M-04 đối chứng: PUT có cme_manage đổi được tín chỉ / người nhận của dòng đã cấp', async () => {
	const r = await call('UCME', 'PUT', '/seminars/SEM1/participants/SPT_ISSUED', {
		cme_credits: 8,
		user_id: 'U_NEW',
		cme_issued_date: '2026-02-02',
	});
	assert.equal(r.status, 200);
	const up = updateOf(r.entries);
	assert.equal(up.inputs.cme_credits, 8);
	assert.equal(up.inputs.user_id, 'U_NEW');
	assert.match(up.text, /cme_issued_date = @cme_issued_date/);
});

test('M-04: bulk-cme cần seminars:cme_manage (không còn chỉ seminars:update)', async () => {
	const body = { participant_ids: ['SPT_ISSUED'], status: 'signed' };
	let r = await call('UORG', 'POST', '/seminars/SEM1/participants/bulk-cme', body);
	assert.equal(r.status, 403);
	assert.equal(updateOf(r.entries), undefined);

	r = await call('UCME', 'POST', '/seminars/SEM1/participants/bulk-cme', body);
	assert.equal(r.status, 200);
	assert.ok(updateOf(r.entries));
});
