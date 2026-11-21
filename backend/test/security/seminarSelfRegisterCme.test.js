// Hồi quy M-08 (audit run-5): người tự đăng ký Tập huấn bệnh viện trên cổng
// (/me/hospital-trainings — dòng không vé, created_by = user_id) không được coi là "ban tổ chức
// thêm" nữa: phải điểm danh mới đủ điều kiện cấp CME, và hiện trong danh sách "chưa tham dự"
// của khoa bắt buộc. Dòng ban tổ chức thêm / nhập Excel giữ miễn trừ cũ.
// Chạy router + authorizePermission + controller + service thật trên CSDL giả.
process.env.JWT_SECRET = 'test-secret';
require('../../scripts/lib/static-check-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const ROLES = {
	RCME: [
		{ resource: 'seminars', action: 'read', scope: 'all' },
		{ resource: 'seminars', action: 'update', scope: 'all' },
		{ resource: 'seminars', action: 'cme_manage', scope: 'all' },
	],
	// học viên: không có quyền seminars:* nào
	RNONE: [],
};
const USERS = { UCME: 'RCME', U_SELF: 'RNONE' };

// Dịch biểu thức SELF_CREATED_SQL (chỉ gồm IS NOT NULL / = / AND / OR) sang JS để kiểm
// đúng ngữ nghĩa của chính đoạn SQL gửi xuống CSDL.
const sqlToJs = (expr) =>
	new Function(
		'r',
		`return ${expr
			.replace(/\s+/g, ' ')
			.replace(/p\.(\w+) IS NOT NULL/g, '(r.$1 != null)')
			.replace(/p\.(\w+) = p\.(\w+)/g, '(r.$1 === r.$2)')
			.replace(/\bAND\b/g, '&&')
			.replace(/\bOR\b/g, '||')};`,
	);

// Người tham dự hội nghị SEM1 (chưa ai có số CME)
const ROWS = {
	// tự đăng ký trên cổng, vắng mặt
	SPT_SELF_ABSENT: {
		ticket_code: null,
		user_id: 'U_SELF',
		created_by: 'U_SELF',
		checked_in_at: null,
	},
	// tự đăng ký trên cổng, có điểm danh
	SPT_SELF_IN: {
		ticket_code: null,
		user_id: 'U_SELF2',
		created_by: 'U_SELF2',
		checked_in_at: '2026-11-20T08:00:00Z',
	},
	// ban tổ chức thêm, không điểm danh — vẫn đủ điều kiện (BTC chịu trách nhiệm)
	SPT_ORG: { ticket_code: null, user_id: 'U_STAFF', created_by: 'UCME', checked_in_at: null },
	// dòng cũ không ghi người tạo
	SPT_LEGACY: { ticket_code: null, user_id: 'U_OLD', created_by: null, checked_in_at: null },
	// người ngoài viện nhập Excel
	SPT_EXT: { ticket_code: null, user_id: null, created_by: 'UCME', checked_in_at: null },
	// tự đăng ký qua QR có vé, chưa điểm danh
	SPT_TICKET: { ticket_code: 'abc', user_id: null, created_by: null, checked_in_at: null },
};

test('M-08: SELF_CREATED_SQL — dòng tự đăng ký trên cổng / có vé là "tự tạo", dòng BTC thêm thì không', () => {
	assert.equal(selfCreated(ROWS.SPT_SELF_ABSENT), true);
	assert.equal(selfCreated(ROWS.SPT_TICKET), true);
	assert.equal(selfCreated(ROWS.SPT_ORG), false);
	assert.equal(selfCreated(ROWS.SPT_LEGACY), false);
	assert.equal(selfCreated(ROWS.SPT_EXT), false);
});

let lastInsert = null;
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
	// getForMe của cổng tự đăng ký: buổi tập huấn đang mở, người gọi chưa có trong danh sách
	if (/AS self_registered/.test(text)) {
		if (lastInsert) {
			return [{ id: 'SEM1', participant_id: 'SPT_NEW', self_registered: true, open: true }];
		}
		return [{ id: 'SEM1', participant_id: null, open: true, before_day: true, required: false }];
	}
	if (/FROM users u LEFT JOIN departments d/.test(text) && /NOT EXISTS/.test(text))
		return [
			{ id: inputs.ids && JSON.parse(inputs.ids)[0], full_name: 'Hoc Vien', staff_number: 7 },
		];
	if (/INSERT INTO seminar_participants/.test(text)) {
		lastInsert = inputs;
		return [{}]; // rowsAffected = 1 (bulkAdd chỉ đếm dòng thực sự chèn)
	}
	// issueCme: CSDL giả tính "eligible" bằng chính đoạn SELF_CREATED_SQL trong câu gửi xuống
	if (/AS eligible/.test(text)) {
		const ids = Object.keys(inputs)
			.filter((k) => /^p\d+$/.test(k))
			.map((k) => inputs[k]);
		const selfSql = text.match(
			/NOT (\(p\.ticket_code IS NOT NULL[\s\S]*?p\.created_by = p\.user_id\)\))/,
		);
		assert.ok(selfSql, 'điều kiện CME phải loại dòng tự tạo khỏi miễn trừ điểm danh');
		const isSelf = sqlToJs(selfSql[1]);
		return ids
			.filter((id) => ROWS[id])
			.map((id) => ({ id, eligible: !isSelf(ROWS[id]) || !!ROWS[id].checked_in_at }));
	}
	return [];
});
// nạp service SAU khi cài CSDL giả (service destructure getPool lúc nạp module)
const { SELF_CREATED_SQL } = require('../../src/modules/seminars/seminarParticipantService');
const selfCreated = sqlToJs(SELF_CREATED_SQL);
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
	return { status: res.status, body: await res.json().catch(() => null), entries: log.slice(n) };
};
const cmeUpdates = (entries) =>
	entries
		.filter((e) => /SET cme_year = @year, cme_seq = @seq/.test(e.text))
		.map((e) => e.inputs.pid);

test('M-08: tự đăng ký trên cổng tạo dòng không vé, created_by = chính mình ⇒ là dòng "tự tạo"', async () => {
	const r = await call('U_SELF', 'POST', '/me/hospital-trainings/SEM1/register');
	assert.equal(r.status, 201);
	assert.ok(lastInsert);
	assert.equal(lastInsert.ticket_code, null);
	assert.equal(lastInsert.actor_id, 'U_SELF');
	assert.equal(lastInsert.user_id, 'U_SELF');
	assert.equal(
		selfCreated({ ...lastInsert, created_by: lastInsert.actor_id }),
		true,
		'dòng vừa tạo phải bị coi là tự đăng ký (phải điểm danh)',
	);
});

test('M-08: cấp CME hàng loạt bỏ qua người tự đăng ký trên cổng mà không điểm danh', async () => {
	const ids = Object.keys(ROWS);
	const r = await call('UCME', 'POST', '/seminars/SEM1/participants/issue-cme', {
		participant_ids: ids,
	});
	assert.equal(r.status, 200);
	const issued = cmeUpdates(r.entries);
	assert.ok(!issued.includes('SPT_SELF_ABSENT'), 'tự đăng ký + vắng mặt không được cấp CME');
	assert.ok(!issued.includes('SPT_TICKET'), 'có vé + chưa điểm danh không được cấp CME');
	// đối chứng: các dòng còn lại vẫn cấp như cũ
	for (const id of ['SPT_SELF_IN', 'SPT_ORG', 'SPT_LEGACY', 'SPT_EXT'])
		assert.ok(issued.includes(id), `${id} phải được cấp`);
	assert.equal(r.body.data.skipped, 2);
});

test('M-08: "chưa tham dự" của khoa bắt buộc tính cả người tự đăng ký trên cổng chưa điểm danh', async () => {
	const r = await call('UCME', 'GET', '/seminars/SEM1/required-absentees');
	assert.equal(r.status, 200);
	const q = r.entries.find((e) => /FROM seminar_required_departments r/.test(e.text));
	assert.ok(q);
	assert.match(q.text, /p\.user_id, p\.created_by FROM seminar_participants p/);
	assert.ok(
		q.text.includes(`(p.id IS NULL OR (${SELF_CREATED_SQL} AND p.checked_in_at IS NULL))`),
		'dòng tự tạo chưa điểm danh phải tính là chưa tham dự',
	);
	assert.doesNotMatch(q.text, /p\.ticket_code IS NOT NULL AND p\.checked_in_at IS NULL/);
});
