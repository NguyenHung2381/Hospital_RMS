// Hồi quy cho nhóm lỗi phạm vi dữ liệu `users` (rà soát bảo mật run-4), chạy trên CSDL giả:
//   M-11 quyền ghi trên người dùng (reset mật khẩu / sửa / xóa / tạo) theo phạm vi của
//        lượt cấp users:<action>, không theo users:read;
//   L-01 quy tắc tập con vai trò so với phạm vi HIỆU LỰC của actor (phạm vi xem runtime);
//   L-16 xuất Excel người dùng: giới hạn theo khoa mà chưa có khoa ⇒ file rỗng;
//   L-03 "Thêm NV" / nhập create_missing của CME ghim khoa theo phạm vi users:create.
// Vai trò seed (database/seed/system-roles.json) đều một phạm vi cho mỗi resource ⇒
// các ca đối chứng (admin @all, dept_head @department) giữ nguyên hành vi.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { install } = require('../auth/fakeDb');

// Danh bạ giả cho userService.getAll (xuất Excel)
const DIRECTORY = [
	{ id: 'U1', username: 'dummy_k1', department_id: 'K1' },
	{ id: 'U2', username: 'dummy_k2', department_id: 'K2' },
	{ id: 'U3', username: 'dummy_k3', department_id: 'K3' },
];
const DEPTS = {
	K1: { id: 'K1', name: 'Khoa Một', code: 'K1' },
	K2: { id: 'K2', name: 'Khoa Hai', code: 'K2' },
};

const log = install(async (text, inputs) => {
	if (/FROM roles WHERE code IS NOT NULL|SELECT id, code FROM roles/.test(text))
		return [{ id: 'VT99', code: 'trainee' }];
	if (/FROM users u/.test(text)) {
		const depts = Object.keys(inputs)
			.filter((k) => /^dept\d+$/.test(k))
			.map((k) => inputs[k]);
		return DIRECTORY.filter((u) => !depts.length || depts.includes(u.department_id)).map((u) => ({
			...u,
			full_name: u.username,
			staff_number: 1,
			email: `${u.username}@example.test`,
			department_name: u.department_id,
			role_name: 'Thành viên',
			is_active: true,
			created_at: new Date('2026-01-01'),
		}));
	}
	// createMissingStaff: [Mã NV đã có?, khoa theo id]
	if (/SELECT id, full_name, is_active FROM users WHERE staff_number = @sn/.test(text)) return [];
	if (/SELECT id, name, code FROM departments WHERE id = @dept/.test(text))
		return DEPTS[inputs.dept] ? [DEPTS[inputs.dept]] : [];
	return [];
});
// fakeDb ghép lô queryAll thành 1 câu và chỉ trả 1 tập kết quả — ở đây chạy từng câu
// riêng để createMissingStaff nhận đủ [Mã NV đã có?, khoa]. Phải thay TRƯỚC khi nạp
// service (chúng destructure queryAll lúc nạp module).
const db = require('../../src/config/db');
db.queryAll = async (req, statements) => {
	const out = [];
	for (const st of statements) out.push((await req.query(st)).recordset);
	return out;
};

// Vai trò của tài khoản đích: chỉ topics:read — mọi actor dưới đây đều "có" quyền đó
const permCache = require('../../src/permissions/permissionCache');
permCache.load = async () => ({ keys: new Set(['topics:read']), scopes: new Map() });

const userService = require('../../src/modules/users/userService');
const TARGETS = {
	U_K1: { id: 'U_K1', department_id: 'K1', role_id: 'R_MEMBER', role_code: 'member' },
	U_K2: { id: 'U_K2', department_id: 'K2', role_id: 'R_MEMBER', role_code: 'member' },
};
const calls = [];
userService.getById = async (id) => (TARGETS[id] ? { ...TARGETS[id] } : null);
userService.update = async (id, d) => (calls.push(['update', id]), { id, ...d });
userService.remove = async (id) => (calls.push(['remove', id]), true);
userService.create = async (d) => (calls.push(['create', d.department_id]), { id: 'NEW', ...d });
userService.resetPassword = async (id) => (
	calls.push(['reset', id]),
	{ temporary_password: 'Tmp#12345' }
);
userService.createStaffAccount = async (st) => (
	calls.push(['staff', st.department_id]),
	{ id: 'NV_NEW', username: 'nv_new', temporary_password: 'Tmp#12345' }
);
const notificationService = require('../../src/modules/notifications/notificationService');
notificationService.push = async () => {};
notificationService.pushWithEmail = async () => {};

const userCtrl = require('../../src/modules/users/userController');
const guard = require('../../src/modules/access/privilegeGuard');
const cmeCtrl = require('../../src/modules/cme/cmeRecordController');
const cmeImport = require('../../src/modules/cme/cmeRecordImportService');
const { buildPreview } = require('../../src/modules/cme/cmeRecordImportPreview');

// actor({ 'users:read': 'all', ... }, 'K1')
const actor = (grants, department_id = 'K1', extra = []) => ({
	id: 'A1',
	role_id: 'R_ACTOR',
	department_id,
	permissions: new Set([...Object.keys(grants), 'topics:read', ...extra]),
	permissionScopes: new Map(Object.entries(grants).filter(([, s]) => s)),
});
const MIXED = actor({
	'users:read': 'all',
	'users:update': 'department',
	'users:delete': 'department',
	'users:create': 'department',
});
const ADMIN = actor({
	'users:read': 'all',
	'users:update': 'all',
	'users:delete': 'all',
	'users:create': 'all',
});

const call = (handler, req) =>
	new Promise((resolve) => {
		const res = {
			status(code) {
				this.code = code;
				return this;
			},
			json: (body) => resolve({ code: res.code ?? 200, body }),
		};
		handler({ params: {}, body: {}, query: {}, ip: '::1', ...req }, res, (err) =>
			resolve({ code: err?.statusCode ?? 500, err }),
		);
	});

const lastCall = () => calls.at(-1);

// ─── M-11 ─────────────────────────────────────────────────────────────────────

test('M-11: users:read@all + ghi @department không reset / sửa / xóa được tài khoản khoa khác', async () => {
	calls.length = 0;
	const reset = await call(userCtrl.resetPassword, { user: MIXED, params: { id: 'U_K2' } });
	assert.equal(reset.code, 403);
	assert.equal(reset.body?.data?.temporary_password, undefined);
	const upd = await call(userCtrl.updateOne, {
		user: MIXED,
		params: { id: 'U_K2' },
		body: { email: 'x@example.test', is_active: false },
	});
	assert.equal(upd.code, 403);
	const del = await call(userCtrl.removeOne, { user: MIXED, params: { id: 'U_K2' } });
	assert.equal(del.code, 403);
	assert.deepEqual(calls, [], 'không lời gọi ghi nào tới userService');
});

test('M-11: tạo tài khoản theo phạm vi users:create — ghim vào khoa người tạo', async () => {
	calls.length = 0;
	const r = await call(userCtrl.createOne, {
		user: MIXED,
		body: { username: 'x', full_name: 'X', department_id: 'K2' },
	});
	assert.equal(r.code, 201);
	assert.deepEqual(lastCall(), ['create', 'K1']);
	// Bị giới hạn theo khoa mà chưa có khoa ⇒ từ chối (không tạo tài khoản khoa NULL)
	const noDept = await call(userCtrl.createOne, {
		user: { ...MIXED, department_id: null },
		body: { username: 'y', full_name: 'Y', department_id: 'K2' },
	});
	assert.equal(noDept.code, 403);
	assert.equal(calls.length, 1);
});

test('M-11: không chuyển tài khoản trong khoa sang khoa khác bằng phạm vi đọc rộng', async () => {
	const r = await call(userCtrl.updateOne, {
		user: MIXED,
		params: { id: 'U_K1' },
		body: { department_id: 'K2' },
	});
	assert.equal(r.code, 403);
});

test('M-11 đối chứng: cùng actor vẫn reset / sửa / xóa tài khoản trong khoa mình', async () => {
	calls.length = 0;
	const reset = await call(userCtrl.resetPassword, { user: MIXED, params: { id: 'U_K1' } });
	assert.equal(reset.code, 200);
	assert.equal(reset.body.data.temporary_password, 'Tmp#12345');
	const upd = await call(userCtrl.updateOne, {
		user: MIXED,
		params: { id: 'U_K1' },
		body: { email: 'x@example.test' },
	});
	assert.equal(upd.code, 200);
	const del = await call(userCtrl.removeOne, { user: MIXED, params: { id: 'U_K1' } });
	assert.equal(del.code, 200);
	assert.deepEqual(calls, [
		['reset', 'U_K1'],
		['update', 'U_K1'],
		['remove', 'U_K1'],
	]);
});

test('M-11 đối chứng: vai trò @all (admin seed) vẫn quản lý tài khoản mọi khoa', async () => {
	calls.length = 0;
	assert.equal(
		(await call(userCtrl.resetPassword, { user: ADMIN, params: { id: 'U_K2' } })).code,
		200,
	);
	assert.equal(
		(
			await call(userCtrl.updateOne, {
				user: ADMIN,
				params: { id: 'U_K2' },
				body: { department_id: 'K1' },
			})
		).code,
		200,
	);
	assert.equal((await call(userCtrl.removeOne, { user: ADMIN, params: { id: 'U_K2' } })).code, 200);
	const c = await call(userCtrl.createOne, {
		user: ADMIN,
		body: { username: 'z', full_name: 'Z', department_id: 'K2' },
	});
	assert.equal(c.code, 201);
	assert.deepEqual(lastCall(), ['create', 'K2']);
});

test('M-11: phạm vi xem hẹp hơn lượt ghi vẫn giới hạn thao tác ghi (không nới so với trước)', async () => {
	const narrowRead = actor({ 'users:read': 'department', 'users:update': 'all' });
	const r = await call(userCtrl.resetPassword, { user: narrowRead, params: { id: 'U_K2' } });
	assert.equal(r.code, 403);
	await assert.rejects(
		guard.assertCanManageUser(MIXED, TARGETS.U_K2, 'delete'),
		(e) => e.statusCode === 403,
	);
	await guard.assertCanManageUser(MIXED, TARGETS.U_K1, 'delete');
});

// ─── L-01 ─────────────────────────────────────────────────────────────────────

test('L-01: roles:manage có topics:read@department + topics:update@all không cấp được topics:update@all', async () => {
	const mixed = actor({ 'topics:read': 'department', 'topics:update': 'all' }, 'K1', [
		'roles:manage',
	]);
	assert.throws(
		() => guard.assertCanChangeGrants(mixed, [], [{ key: 'topics:update', scope: 'all' }]),
		(e) => e.statusCode === 403,
	);
	// Gán vai trò sẵn có mang topics:update@all cũng bị chặn
	permCache.load = async () => ({
		keys: new Set(['topics:update']),
		scopes: new Map([['topics:update', 'all']]),
	});
	try {
		await assert.rejects(guard.assertCanAssignRole(mixed, 'VT91'), (e) => e.statusCode === 403);
	} finally {
		permCache.load = async () => ({ keys: new Set(['topics:read']), scopes: new Map() });
	}
	// Trong phạm vi hiệu lực của mình thì vẫn cấp được
	guard.assertCanChangeGrants(mixed, [], [{ key: 'topics:update', scope: 'department' }]);
});

test('L-01 đối chứng: actor một phạm vi mỗi resource giữ nguyên hành vi', () => {
	const allScope = actor({ 'topics:read': 'all', 'topics:update': 'all' }, 'K1', ['roles:manage']);
	guard.assertCanChangeGrants(allScope, [], [{ key: 'topics:update', scope: 'all' }]);
	const deptScope = actor({ 'topics:read': 'department', 'topics:update': 'department' }, 'K1', [
		'roles:manage',
	]);
	assert.throws(
		() => guard.assertCanChangeGrants(deptScope, [], [{ key: 'topics:update', scope: 'all' }]),
		(e) => e.statusCode === 403,
	);
	guard.assertCanChangeGrants(deptScope, [], [{ key: 'topics:update', scope: 'department' }]);
});

// ─── L-16 ─────────────────────────────────────────────────────────────────────

const callExport = (user, body = {}) =>
	new Promise((resolve, reject) => {
		const res = new PassThrough();
		const chunks = [];
		res.statusCode = 200;
		res.setHeader = () => {};
		res.status = (c) => ((res.statusCode = c), res);
		res.json = (b) => resolve({ code: res.statusCode, json: b });
		res.on('data', (c) => chunks.push(c));
		res.on('end', () => resolve({ code: res.statusCode, buf: Buffer.concat(chunks) }));
		userCtrl.exportExcel({ user, body }, res, reject);
	});

const usernamesIn = async (buf) => {
	const ExcelJS = require('exceljs');
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(buf);
	const out = new Set();
	wb.worksheets[0].eachRow((row) =>
		row.eachCell((c) => {
			if (/^dummy_k\d+$/.test(String(c.value))) out.add(String(c.value));
		}),
	);
	return [...out];
};

const DEPT_HEAD = (dept) => actor({ 'users:read': 'department' }, dept);

test('L-16: người đọc phạm vi khoa chưa có khoa xuất Excel ra file rỗng, không truy vấn danh bạ', async () => {
	for (const body of [{}, { role_id: 'VT99' }, { department_id: 'K2' }]) {
		const n = log.length;
		const r = await callExport(DEPT_HEAD(null), body);
		assert.equal(r.code, 200);
		assert.deepEqual(await usernamesIn(r.buf), []);
		assert.ok(!log.slice(n).some((l) => /FROM users u/.test(l.text)));
	}
	// Danh sách cũng rỗng như trước
	const list = await call(userCtrl.getAll, { user: DEPT_HEAD(null) });
	assert.equal(list.code, 200);
	assert.deepEqual(list.body.data.data, []);
});

test('L-16 đối chứng: người đọc khoa K1 chỉ xuất K1; người đọc @all xuất cả viện', async () => {
	const k1 = await callExport(DEPT_HEAD('K1'), { department_id: 'K2' });
	assert.deepEqual(await usernamesIn(k1.buf), ['dummy_k1']);
	const all = await callExport(actor({ 'users:read': 'all' }, null));
	assert.deepEqual(await usernamesIn(all.buf), ['dummy_k1', 'dummy_k2', 'dummy_k3']);
});

// ─── L-03 ─────────────────────────────────────────────────────────────────────

const CME_DEPT = actor({ 'users:read': 'department', 'users:create': 'department' }, 'K1', [
	'cme_records:manage',
]);
const CME_ALL = actor({ 'users:read': 'all', 'users:create': 'all' }, 'K1', ['cme_records:manage']);

test('L-03: "Thêm NV" của CME với users:create@department luôn tạo vào khoa người tạo', async () => {
	calls.length = 0;
	const body = { staff_number: '777', full_name: 'Dummy Member', department_id: 'K2' };
	const r = await call(cmeCtrl.createStaff, { user: CME_DEPT, body });
	assert.equal(r.code, 201);
	assert.equal(r.body.data.department_name, 'Khoa Một');
	assert.deepEqual(calls, [['staff', 'K1']]);
	// Kể cả actor có users:read@all nhưng users:create@department
	calls.length = 0;
	const mixed = { ...MIXED, permissions: new Set([...MIXED.permissions, 'cme_records:manage']) };
	assert.equal((await call(cmeCtrl.createStaff, { user: mixed, body })).code, 201);
	assert.deepEqual(calls, [['staff', 'K1']]);
	// Chưa có khoa ⇒ 403, không tạo
	calls.length = 0;
	const noDept = await call(cmeCtrl.createStaff, {
		user: { ...CME_DEPT, department_id: null },
		body,
	});
	assert.equal(noDept.code, 403);
	assert.deepEqual(calls, []);
});

test('L-03 đối chứng: users:create@all chọn được khoa; thiếu users:create vẫn 403', async () => {
	calls.length = 0;
	const body = { staff_number: '778', full_name: 'Dummy Member', department_id: 'K2' };
	const r = await call(cmeCtrl.createStaff, { user: CME_ALL, body });
	assert.equal(r.code, 201);
	assert.deepEqual(calls, [['staff', 'K2']]);
	const none = actor({ 'users:read': 'all' }, 'K1', ['cme_records:manage']);
	assert.equal((await call(cmeCtrl.createStaff, { user: none, body })).code, 403);
});

test('L-03: nhập create_missing ghim khoa người nhập (controller → defaults → preview)', async () => {
	const seen = [];
	const original = cmeImport.importExcel;
	cmeImport.importExcel = async ({ defaults }) => (seen.push(defaults), { dry_run: true });
	try {
		const req = (user) => ({
			user,
			file: { buffer: Buffer.alloc(0) },
			body: {
				create_missing: '1',
				dry_run: '1',
				new_department_id: 'K2',
				staff_departments: JSON.stringify({ 779: 'K2' }),
			},
		});
		assert.equal((await call(cmeCtrl.importExcel, req(CME_DEPT))).code, 200);
		assert.equal(seen.at(-1).force_department_id, 'K1');
		assert.equal((await call(cmeCtrl.importExcel, req(CME_ALL))).code, 200);
		assert.equal(seen.at(-1).force_department_id, null);
		const noDept = await call(cmeCtrl.importExcel, req({ ...CME_DEPT, department_id: null }));
		assert.equal(noDept.code, 403);
		assert.equal(seen.length, 2);
	} finally {
		cmeImport.importExcel = original;
	}

	// Preview: khoa ép buộc thắng staff_departments, cột Khoa/Phòng trong file, new_department_id
	const lookups = {
		byStaff: new Map(),
		byName: new Map(),
		categoryByName: new Map(),
		categoryByGroup: new Map(),
		conversionById: new Map(),
		deptById: new Map(Object.entries(DEPTS)),
		deptByKey: new Map([['k2', DEPTS.K2]]),
		takenStaff: new Map(),
		knownStaff: new Map(),
	};
	const rows = [{ row: 2, staff_number: 779, full_name: 'Dummy New', department_raw: 'K2' }];
	const base = { create_missing: true, new_department_id: 'K2', staff_departments: { 779: 'K2' } };
	const [forced] = buildPreview(rows, lookups, { ...base, force_department_id: 'K1' });
	assert.equal(forced.new_staff.department_id, 'K1');
	const [free] = buildPreview(rows, lookups, base);
	assert.equal(free.new_staff.department_id, 'K2');
});
