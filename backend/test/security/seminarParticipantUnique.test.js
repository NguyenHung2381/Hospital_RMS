// Hồi quy L-06 (audit run-5): 2 yêu cầu tự đăng ký tập huấn song song không được tạo 2 dòng
// tham dự cho cùng 1 tài khoản (nhân đôi giờ CME). Chống trùng nằm ở CSDL: unique index
// ux_sp_seminar_user (migration 2026-12-31) + INSERT ... ON CONFLICT DO NOTHING ở bulkAdd.
// Chạy router + controller + service thật trên CSDL giả; CSDL giả mô phỏng ràng buộc unique
// (seminar_id, user_id) và cho 2 yêu cầu cùng đọc "chưa đăng ký" trước khi bên nào kịp chèn.
process.env.JWT_SECRET = 'test-secret';
require('../../scripts/lib/static-check-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { install } = require('../auth/fakeDb');

const MIGRATION = path.join(
	__dirname,
	'../../database/migrations/2026-12-31_ux_nguoi_tham_du_hoi_thao_theo_tai_khoan.sql',
);

const ROLES = {
	RORG: [
		{ resource: 'seminars', action: 'read', scope: 'all' },
		{ resource: 'seminars', action: 'update', scope: 'all' },
	],
	RNONE: [],
};
const USERS = { UORG: 'RORG', U_RACE: 'RNONE' };

// Bảng seminar_participants giả: khóa "seminar_id|user_id"
const rows = new Map();
const pgUniqueError = () =>
	Object.assign(new Error('duplicate key value violates unique constraint "ux_sp_seminar_user"'), {
		code: '23505',
		severity: 'ERROR',
		constraint: 'ux_sp_seminar_user',
	});
// Cổng chờ: giữ các lượt đọc "đã đăng ký chưa" cho tới khi đủ 2 yêu cầu (mô phỏng xen kẽ)
let raceGate = null;
// Lượt đọc NOT EXISTS "cũ" (không thấy dòng vừa được yêu cầu khác chèn)
let staleRead = false;

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
		return [{ id: 'SEM1', event_year: 2026, cme_default_credits: 3 }];
	// getForMe (cổng tự đăng ký)
	if (/AS self_registered/.test(text)) {
		const has = rows.has(`${inputs.sid}|${inputs.uid}`);
		return [{ id: inputs.sid, participant_id: has ? 'SPT_X' : null, open: true, before_day: true }];
	}
	// addUsers: lọc người chưa có (NOT EXISTS) — đọc ngoài transaction chèn
	if (/FROM users u LEFT JOIN departments d/.test(text) && /NOT EXISTS/.test(text)) {
		const ids = JSON.parse(inputs.ids).filter((u) => staleRead || !rows.has(`${inputs.sid}|${u}`));
		if (raceGate) await raceGate.arrive();
		return ids.map((id) => ({ id, full_name: `NV ${id}`, staff_number: 1 }));
	}
	if (/INSERT INTO seminar_participants/.test(text)) {
		const key = `${inputs.seminar_id}|${inputs.user_id}`;
		if (inputs.user_id && rows.has(key)) {
			if (/ON CONFLICT \(seminar_id, user_id\) WHERE user_id IS NOT NULL DO NOTHING/.test(text))
				return []; // rowsAffected = 0
			throw pgUniqueError();
		}
		if (inputs.user_id) rows.set(key, inputs.id);
		return [{}];
	}
	if (/SELECT \* FROM seminar_participants/.test(text)) return [{ id: inputs.id }];
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

const call = async (who, method, p, body) => {
	const n = log.length;
	const res = await fetch(base + p, {
		method,
		headers: {
			authorization: `Bearer ${signToken('access', { id: who, tv: 0 }, '1h')}`,
			'content-type': 'application/json',
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	return { status: res.status, body: await res.json().catch(() => null), entries: log.slice(n) };
};

test('L-06: migration dọn trùng sẵn có rồi mới tạo unique index (seminar_id, user_id)', () => {
	const text = fs.readFileSync(MIGRATION, 'utf8');
	const idx = text.search(
		/CREATE UNIQUE INDEX IF NOT EXISTS ux_sp_seminar_user\s+ON seminar_participants \(seminar_id, user_id\) WHERE \(user_id IS NOT NULL\)/,
	);
	assert.ok(idx > 0, 'thiếu unique index ux_sp_seminar_user');
	const del = text.search(/DELETE FROM seminar_participants/);
	const unlink = text.search(/UPDATE seminar_participants\s+SET user_id = NULL/);
	assert.ok(del > 0 && del < idx, 'phải xóa dòng trùng (chưa có số CME) trước khi tạo index');
	assert.ok(unlink > 0 && unlink < idx, 'dòng trùng đã có số CME: gỡ liên kết trước khi tạo index');
	// dòng đã có số CME không bị xóa
	assert.match(
		text,
		/DELETE FROM seminar_participants\s+WHERE id IN \(SELECT id FROM tmp_sp_dup WHERE cme_seq IS NULL\)/,
	);
});

test('L-06: 2 yêu cầu tự đăng ký song song → 1 dòng duy nhất, yêu cầu sau nhận 409', async () => {
	rows.clear();
	let waiting = [];
	raceGate = {
		arrive: () =>
			new Promise((resolve) => {
				waiting.push(resolve);
				if (waiting.length === 2) waiting.forEach((r) => r());
			}),
	};
	const start = log.length;
	const [a, b] = await Promise.all([
		call('U_RACE', 'POST', '/me/hospital-trainings/SEM1/register'),
		call('U_RACE', 'POST', '/me/hospital-trainings/SEM1/register'),
	]);
	raceGate = null;
	waiting = [];
	assert.deepEqual([a.status, b.status].sort(), [201, 409]);
	assert.equal([...rows.keys()].filter((k) => k === 'SEM1|U_RACE').length, 1);
	const inserts = log.slice(start).filter((e) => /INSERT INTO seminar_participants/.test(e.text));
	assert.equal(inserts.length, 2, 'cả 2 yêu cầu đều qua bước đọc và thử chèn (đúng kịch bản đua)');
	for (const e of inserts) assert.match(e.text, /ON CONFLICT \(seminar_id, user_id\)/);
});

test('L-06: thêm nhân sự (add-users) đếm đúng số dòng thực sự chèn, bỏ qua người đã có', async () => {
	rows.clear();
	const r = await call('UORG', 'POST', '/seminars/SEM1/participants/add-users', {
		user_ids: ['U_B', 'U_C'],
	});
	assert.equal(r.status, 201);
	assert.equal(r.body.data.inserted, 2);
	rows.delete('SEM1|U_C');
	// U_B đã có nhưng lượt đọc NOT EXISTS không thấy (vừa được chèn song song) ⇒ ON CONFLICT bỏ qua
	staleRead = true;
	const again = await call('UORG', 'POST', '/seminars/SEM1/participants/add-users', {
		user_ids: ['U_B', 'U_C'],
	});
	staleRead = false;
	assert.equal(again.status, 201);
	assert.equal(again.body.data.inserted, 1);
	assert.equal(again.body.data.skipped, 1);
});

test('L-06: thêm tay 1 người đã có tài khoản trong danh sách → 409 rõ nghĩa', async () => {
	rows.clear();
	rows.set('SEM1|U_DUP', 'SPT_OLD');
	const r = await call('UORG', 'POST', '/seminars/SEM1/participants', {
		full_name: 'Nguoi Trung',
		user_id: 'U_DUP',
	});
	assert.equal(r.status, 409);
	assert.match(r.body.message, /đã có trong danh sách/);
});
