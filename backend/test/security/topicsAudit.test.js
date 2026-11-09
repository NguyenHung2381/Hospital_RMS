// Hồi quy cho các lỗi module đề tài của đợt rà soát bảo mật run-4, chạy qua router
// /topics THẬT (authorizePermission, router.param phạm vi, validator, controller,
// service) với CSDL giả; chỉ bỏ qua authenticate và các tác dụng phụ (thông báo,
// sự kiện, trường tùy chỉnh):
//   M-06 phạm vi khoa: NULL = NULL không phải "cùng khoa"
//   M-05 email thành viên tự điền từ mã NV không được trả nguyên văn
//   L-09 PUT /authors theo cùng luật leader/secretary + mốc thời gian
//   L-10 phạm vi khoa chỉ tạo đề tài của khoa mình
//   L-11 DELETE thành viên lạ ⇒ 404, không xóa trường tùy chỉnh
//   L-12 nhập bổ sung (legacy) bị ràng buộc hạn: chỉ vào đợt đã đóng / qua hạn đăng ký
//   L-13 có quy trình duyệt active ⇒ PUT không đổi được status, 'supplement' kiểm assignee
process.env.JWT_SECRET = 'test-secret';
process.env.LOG_LEVEL = 'silent';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { install } = require('../auth/fakeDb');

const day = (offset) => new Date(Date.now() + offset * 86400000);

// ─── Dữ liệu giả ─────────────────────────────────────────────────────────────
const TOPICS = {
	TNULL: { id: 'TNULL', department_id: null, status: 'submitted', round_id: 'R1', is_legacy: 0 },
	TK1: { id: 'TK1', department_id: 'K1', status: 'submitted', round_id: 'R1', is_legacy: 0 },
	TK1A: { id: 'TK1A', department_id: 'K1', status: 'approved', round_id: 'R1', is_legacy: 0 },
	TK2: { id: 'TK2', department_id: 'K2', status: 'submitted', round_id: 'R1', is_legacy: 0 },
	// đề tài nhập bổ sung đang chờ duyệt: chủ nhiệm/thư ký luôn sửa được (deadlineGuard)
	TLEG: { id: 'TLEG', department_id: 'K1', status: 'submitted', round_id: 'R1', is_legacy: 1 },
	// đề tài thường, ngoài mọi mốc thời gian
	TWIN: { id: 'TWIN', department_id: 'K1', status: 'submitted', round_id: 'R1', is_legacy: 0 },
};
// topic_id → { user_id: role }
const MEMBERSHIP = {
	TLEG: { ULEAD: 'leader' },
	TWIN: { ULEAD: 'leader', UPLAIN: 'member' },
	TK2: { UOTHER: 'leader' },
};
const MEMBER_ROWS = {
	TLEG: [
		{
			id: 'M1',
			topic_id: 'TLEG',
			ho_ten: 'Chủ nhiệm',
			email: 'lead@hospital.example',
			user_id: 'ULEAD',
		},
		{
			id: 'M2',
			topic_id: 'TLEG',
			ho_ten: 'Thành viên',
			email: 'bob.dummy@hospital.example',
			user_id: null,
		},
	],
};
const STAFF_EMAIL = { 5001: 'alice.dummy@hospital.example', 5002: 'bob.dummy@hospital.example' };
const ROLES = [
	{ id: 'VT02', code: 'director' },
	{ id: 'VT04', code: 'review_council' },
	{ id: 'VT09', code: 'admin' },
	{ id: 'VT10', code: 'trainee' },
];
const state = {
	editWindowOpen: new Set(), // topic_id có mốc 'edit' đang mở
	regDeadlines: [], // round_deadlines 'topic_registration' của đợt đang xét
	round: { id: 'R1', name: 'Đợt 1', status: 'open', end_date: day(60) },
	workflowActive: false,
	workflowTask: { id: 'WFT1', assignee_role_id: 'VT02' },
	memberRowExists: new Set(['TLEG:M1', 'TLEG:M2']),
};

const log = install(async (text, inputs) => {
	if (/FROM roles WHERE code IS NOT NULL/.test(text)) return ROLES;
	// ── phạm vi (topicPolicy.assertTopicInScope)
	if (/SELECT t\.department_id,\s+CASE WHEN EXISTS/.test(text)) {
		const t = TOPICS[inputs.id];
		return t
			? [{ department_id: t.department_id, is_member: MEMBERSHIP[t.id]?.[inputs.uid] ? 1 : 0 }]
			: [];
	}
	// ── topicService.getById
	if (/SELECT t\.\*, r\.name AS round_name/.test(text)) {
		const t = TOPICS[inputs.id];
		return t ? [{ ...t, title: 'Đề tài thử' }] : [];
	}
	if (
		/SELECT 1 AS ok FROM topic_members\s+WHERE topic_id = @topic_id AND user_id = @user_id/.test(
			text,
		)
	)
		return MEMBERSHIP[inputs.topic_id]?.[inputs.user_id] ? [{ ok: 1 }] : [];
	if (
		/FROM topic_members tm\s+LEFT JOIN departments md/.test(text) || // getById
		/FROM topic_members tm\s+LEFT JOIN users u ON u\.id = tm\.user_id/.test(text) // getMembers
	)
		return MEMBER_ROWS[inputs.topic_id] ?? [];
	if (/FROM topic_related_departments/.test(text)) return [];
	// ── deadlineGuard
	if (/SELECT round_id, status, is_legacy FROM topics WHERE id = @tid/.test(text)) {
		const t = TOPICS[inputs.tid];
		return t ? [t] : [];
	}
	if (
		/SELECT 1 WHERE EXISTS \(SELECT 1 FROM topic_members\s+WHERE topic_id = @tid AND user_id = @uid AND role IN/.test(
			text,
		)
	) {
		const role = MEMBERSHIP[inputs.tid]?.[inputs.uid];
		return role === 'leader' || role === 'secretary' ? [{}] : [];
	}
	if (/FROM round_deadlines\s+WHERE round_id = @rid\s+AND deadline_type IN/.test(text))
		return state.editWindowOpen.has(inputs.rid_topic ?? lastWindowTopic)
			? [
					{
						deadline_type: 'edit',
						start_date: day(-1),
						deadline_date: day(1),
						supplement_fields: null,
					},
				]
			: [];
	if (/deadline_type = 'topic_registration'/.test(text)) return state.regDeadlines;
	// ── nhập bổ sung
	if (/SELECT id, name, status, end_date FROM research_rounds/.test(text)) return [state.round];
	// ── thành viên
	if (
		/UPDATE topic_members SET/.test(text) &&
		/WHERE id = @id AND topic_id = @topic_id/.test(text)
	) {
		if (!state.memberRowExists.has(`${inputs.topic_id}:${inputs.id}`)) return [];
		const row = MEMBER_ROWS[inputs.topic_id]?.find((m) => m.id === inputs.id);
		if (row && 'email' in inputs) row.email = inputs.email; // email ĐẦY ĐỦ được lưu
		return [{}];
	}
	if (/FROM topic_members tm WHERE tm\.id = @id AND tm\.topic_id = @topic_id/.test(text)) {
		const row = MEMBER_ROWS[inputs.topic_id]?.find((m) => m.id === inputs.id);
		return row ? [row] : [];
	}
	if (/DELETE FROM topic_members WHERE id = @id AND topic_id = @topic_id/.test(text))
		return state.memberRowExists.has(`${inputs.topic_id}:${inputs.id}`) ? [{}] : [];
	if (/FROM users\s+WHERE staff_number = @sn/.test(text)) {
		const email = STAFF_EMAIL[inputs.sn];
		return email ? [{ email }] : [];
	}
	// ── quy trình duyệt
	if (/SELECT 1 AS x WHERE EXISTS \(SELECT 1 FROM workflow_definitions/.test(text))
		return state.workflowActive ? [{ x: 1 }] : [];
	if (/SELECT \* FROM workflow_definitions WHERE resource/.test(text))
		return state.workflowActive ? [{ id: 'WFD1', resource: 'topics' }] : [];
	if (/SELECT \* FROM workflow_steps/.test(text))
		return [{ id: 'WFS1', step_order: 1, approver_role_id: 'VT02' }];
	if (/SELECT \* FROM workflow_instances WHERE definition_id/.test(text))
		return [{ id: 'WFI1', status: 'in_progress', current_step: 1 }];
	if (
		/SELECT \* FROM workflow_tasks WHERE instance_id = @instance_id AND status = 'pending'/.test(
			text,
		)
	)
		return [state.workflowTask];
	return [];
});
// Mốc 'edit' đang mở cho đề tài nào: deadlineGuard truy theo round_id nên dùng biến theo dõi
// đề tài của request gần nhất.
let lastWindowTopic = null;

require('../../src/modules/events/eventService').broadcast = () => {};
require('../../src/modules/persons/personService').syncPerson = async () => {};
require('../../src/modules/access/permissionService').findActiveUserIdsWhere = async () => [];
require('../../src/modules/notifications/notificationService').pushWithEmail = async () => {};
const customCalls = { remove: [], save: [] };
const formCustomValueService = require('../../src/modules/forms/formCustomValueService');
formCustomValueService.get = async () => ({});
formCustomValueService.getMany = async () => new Map();
formCustomValueService.save = async (...a) => customCalls.save.push(a);
formCustomValueService.remove = async (...a) => customCalls.remove.push(a);
// Cấu hình form không liên quan: bỏ qua, chỉ cần req.formCustom
require('../../src/modules/forms/formConfigGuard').formConfigGuard = () => (req, _res, next) => {
	req.formCustom = null;
	next();
};
// Dùng chung: tạo đề tài giả (ghi lại tham số), duyệt cũ giả
const created = [];
const topicService = require('../../src/modules/topics/topicService');
topicService.create = async (data) => {
	created.push(data);
	return { id: 'TNEW', title: data.title, members: [], ...data };
};
topicService.remove = async () => {};
const topicApprovalService = require('../../src/modules/topics/topicApprovalService');
const approvalCalls = [];
topicApprovalService.approve = async (...a) => {
	approvalCalls.push(a);
	return { ok: true };
};

// Phải nạp SAU các bản vá ở trên: routes destructure một số hàm lúc nạp
const auth = require('../../src/middlewares/auth');
let currentUser = null;
auth.authenticate = (req, _res, next) => {
	req.user = currentUser;
	next();
};
const router = require('../../src/modules/topics/topics.routes');
const topicLegacyService = require('../../src/modules/topics/topicLegacyService');

const app = express();
app.use(express.json());
app.use('/topics', router);
app.use((err, _req, res, _next) =>
	res.status(err.statusCode || err.status || 500).json({ success: false, message: err.message }),
);
let server;
const base = () => `http://127.0.0.1:${server.address().port}/topics`;
test.before(async () => {
	await new Promise((resolve) => {
		server = app.listen(0, resolve);
	});
});
test.after(() => server.close());

const call = async (user, method, path, body) => {
	currentUser = user;
	lastWindowTopic = path.split('/')[1];
	const res = await fetch(base() + path, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	let json = null;
	try {
		json = await res.json();
	} catch {
		/* không có thân */
	}
	return { status: res.status, body: json };
};

const mkUser = (id, perms, scopes = {}, extra = {}) => ({
	id,
	role_id: 'VT00',
	department_id: 'K1',
	permissions: new Set(perms),
	permissionScopes: new Map(Object.entries(scopes)),
	...extra,
});
const OWN = { 'topics:read': 'own', 'topics:update': 'own', 'topics:create': 'own' };
const DEPT = {
	'topics:read': 'department',
	'topics:update': 'department',
	'topics:create': 'department',
};
const ALL = { 'topics:read': 'all', 'topics:update': 'all' };
const TOPIC_PERMS = ['topics:read', 'topics:update', 'topics:create'];

const wrote = (from, re) => log.slice(from).filter((q) => re.test(q.text));

// ─── M-06 ───────────────────────────────────────────────────────────────────
test('M-06: người phạm vi khoa chưa gán khoa KHÔNG xem/sửa được đề tài không có khoa', async () => {
	const noDept = mkUser('UND', TOPIC_PERMS, DEPT, { department_id: null });
	const from = log.length;
	assert.equal((await call(noDept, 'GET', '/TNULL')).status, 403);
	assert.equal((await call(noDept, 'PUT', '/TNULL', { title: 'đổi tên' })).status, 403);
	assert.equal(wrote(from, /UPDATE topics SET/).length, 0);
	// cả khi lớp router.param bị bỏ qua, service cũng từ chối (getById / update)
	await assert.rejects(topicService.getById('TNULL', noDept), { statusCode: 403 });
	await assert.rejects(topicService.update('TNULL', { title: 'x' }, 'UND', noDept), {
		statusCode: 403,
	});
});

test('M-06 (đối chứng): cùng khoa vẫn xem được; khác khoa / mất khoa bị chặn', async () => {
	const k1 = mkUser('UK1', TOPIC_PERMS, DEPT);
	assert.equal((await call(k1, 'GET', '/TK1')).status, 200);
	assert.equal((await call(k1, 'GET', '/TK2')).status, 403);
	assert.equal((await call(k1, 'GET', '/TNULL')).status, 403);
	const noDept = mkUser('UND', TOPIC_PERMS, DEPT, { department_id: null });
	assert.equal((await call(noDept, 'GET', '/TK1')).status, 403);
});

// ─── M-05 ───────────────────────────────────────────────────────────────────
test('M-05: PUT thành viên tự điền email từ mã NV nhưng chỉ trả email đã che', async () => {
	const lead = mkUser('ULEAD', TOPIC_PERMS, OWN);
	const from = log.length;
	const r = await call(lead, 'PUT', '/TLEG/members/M2', { staff_number: 5001 });
	assert.equal(r.status, 200);
	assert.equal(r.body.data.email, 'al***@hospital.example');
	assert.doesNotMatch(JSON.stringify(r.body), /alice\.dummy/);
	// email đầy đủ vẫn được LƯU (gửi thư dùng bản này)
	const upd = wrote(from, /UPDATE topic_members SET/)[0];
	assert.equal(upd.inputs.email, 'alice.dummy@hospital.example');
});

test('M-05: GET thành viên + chi tiết đề tài che email người khác, giữ nguyên dòng của chính mình', async () => {
	const lead = mkUser('ULEAD', TOPIC_PERMS, OWN);
	MEMBER_ROWS.TLEG[1].email = 'alice.dummy@hospital.example';
	const members = (await call(lead, 'GET', '/TLEG/members')).body.data;
	assert.equal(members.find((m) => m.id === 'M1').email, 'lead@hospital.example'); // của mình
	assert.equal(members.find((m) => m.id === 'M2').email, 'al***@hospital.example');
	const detail = (await call(lead, 'GET', '/TLEG')).body.data;
	assert.doesNotMatch(JSON.stringify(detail.members), /alice\.dummy|bob\.dummy/);
});

test('M-05 (đối chứng): người có users:read vẫn thấy email đầy đủ', async () => {
	const admin = mkUser('UADM', [...TOPIC_PERMS, 'users:read'], ALL);
	MEMBER_ROWS.TLEG[1].email = 'alice.dummy@hospital.example';
	const members = (await call(admin, 'GET', '/TLEG/members')).body.data;
	assert.equal(members.find((m) => m.id === 'M2').email, 'alice.dummy@hospital.example');
});

test('M-05: gửi lại email đã che (lấy từ API) không ghi đè email thật', async () => {
	const lead = mkUser('ULEAD', TOPIC_PERMS, OWN);
	const from = log.length;
	const r = await call(lead, 'PUT', '/TLEG/members/M2', {
		email: 'al***@hospital.example',
		chuc_vu: 'KTV',
	});
	assert.equal(r.status, 200);
	const upd = wrote(from, /UPDATE topic_members SET/)[0];
	assert.doesNotMatch(upd.text, /email = @email/);
});

test('M-05: POST /topics/legacy và export-data cũng không trả email thật cho người không có users:read', async () => {
	const lead = mkUser('ULEAD', [...TOPIC_PERMS, 'reports:create'], OWN);
	const real = topicLegacyService.create;
	topicLegacyService.create = async () => ({
		id: 'TNEW',
		title: 'x',
		members: [{ id: 'M1', ho_ten: 'Y', email: 'bob.dummy@hospital.example', user_id: null }],
	});
	try {
		const r = await call(lead, 'POST', '/legacy', {
			title: 'x',
			round_id: 'R1',
			category_id: 'C1',
			department_id: 'K1',
			members: [{ ho_ten: 'Y', role: 'leader' }],
		});
		assert.equal(r.status, 201);
		assert.doesNotMatch(JSON.stringify(r.body), /bob\.dummy/);
		assert.match(r.body.data.members[0].email, /^bo\*\*\*@/);
	} finally {
		topicLegacyService.create = real;
	}
	const realExport = topicService.getForExport;
	topicService.getForExport = async () => [
		{ id: 'TLEG', members: [{ id: 'M2', email: 'bob.dummy@hospital.example' }] },
	];
	try {
		const r = await call(lead, 'POST', '/export-data', { ids: ['TLEG'] });
		assert.equal(r.status, 200);
		assert.doesNotMatch(JSON.stringify(r.body), /bob\.dummy/);
	} finally {
		topicService.getForExport = realExport;
	}
});

// ─── L-09 ───────────────────────────────────────────────────────────────────
test('L-09: thành viên thường / ngoài mốc thời gian KHÔNG ghi đè được danh sách đồng tác giả', async () => {
	const authorsBody = { authors: [{ author_name: 'Tác giả chèn' }] };
	const plain = mkUser('UPLAIN', TOPIC_PERMS, OWN);
	const lead = mkUser('ULEAD', TOPIC_PERMS, OWN);
	state.editWindowOpen.clear(); // mọi mốc đóng
	const from = log.length;
	// chỉ là thành viên thường của TWIN
	assert.equal((await call(plain, 'PUT', '/TWIN/authors', authorsBody)).status, 403);
	// chủ nhiệm nhưng mọi mốc đã đóng
	assert.equal((await call(lead, 'PUT', '/TWIN/authors', authorsBody)).status, 403);
	assert.equal(wrote(from, /DELETE FROM topic_authors/).length, 0);
});

test('L-09 (đối chứng): chủ nhiệm trong mốc sửa đang mở / đề tài legacy chờ duyệt vẫn ghi được', async () => {
	const lead = mkUser('ULEAD', TOPIC_PERMS, OWN);
	const body = { authors: [{ author_name: 'Tác giả A' }] };
	state.editWindowOpen = new Set(['TWIN']);
	let from = log.length;
	assert.equal((await call(lead, 'PUT', '/TWIN/authors', body)).status, 200);
	assert.equal(wrote(from, /DELETE FROM topic_authors/).length, 1);
	state.editWindowOpen.clear();
	from = log.length;
	assert.equal((await call(lead, 'PUT', '/TLEG/authors', body)).status, 200);
	assert.equal(wrote(from, /DELETE FROM topic_authors/).length, 1);
});

test('L-09: phạm vi khoa chỉ sửa đồng tác giả khi đề tài chờ duyệt / bổ sung', async () => {
	const k1 = mkUser('UK1', TOPIC_PERMS, DEPT);
	const body = { authors: [{ author_name: 'Tác giả B' }] };
	const from = log.length;
	assert.equal((await call(k1, 'PUT', '/TK1A/authors', body)).status, 403); // đã duyệt
	assert.equal(wrote(from, /DELETE FROM topic_authors/).length, 0);
	assert.equal((await call(k1, 'PUT', '/TK1/authors', body)).status, 200); // chờ duyệt
});

// ─── L-10 ───────────────────────────────────────────────────────────────────
test('L-10: người phạm vi khoa không tạo được đề tài gắn khoa khác / khi chưa có khoa', async () => {
	const k1 = mkUser('UK1', TOPIC_PERMS, DEPT);
	const base = { title: 'Đề tài mới', round_id: 'R1', category_id: 'C1' };
	created.length = 0;
	assert.equal((await call(k1, 'POST', '/', { ...base, department_id: 'K2' })).status, 403);
	const noDept = mkUser('UND', TOPIC_PERMS, DEPT, { department_id: null });
	assert.equal((await call(noDept, 'POST', '/', { ...base, department_id: 'K2' })).status, 403);
	assert.equal((await call(noDept, 'POST', '/', base)).status, 403);
	assert.equal(created.length, 0);
});

test('L-10 (đối chứng): khoa mình hợp lệ; bỏ trống khoa thì ép về khoa của người tạo', async () => {
	const k1 = mkUser('UK1', TOPIC_PERMS, DEPT);
	const base = { title: 'Đề tài mới', round_id: 'R1', category_id: 'C1' };
	created.length = 0;
	assert.equal((await call(k1, 'POST', '/', { ...base, department_id: 'K1' })).status, 201);
	assert.equal((await call(k1, 'POST', '/', base)).status, 201);
	assert.deepEqual(
		created.map((c) => c.department_id),
		['K1', 'K1'],
	);
	// phạm vi 'all' vẫn chọn tự do khoa
	const all = mkUser('UALL', TOPIC_PERMS, { ...ALL, 'topics:create': 'all' });
	created.length = 0;
	assert.equal((await call(all, 'POST', '/', { ...base, department_id: 'K2' })).status, 201);
	assert.equal(created[0].department_id, 'K2');
});

// ─── L-11 ───────────────────────────────────────────────────────────────────
test('L-11: xóa thành viên không thuộc đề tài trên URL ⇒ 404, không xóa trường tùy chỉnh', async () => {
	const lead = mkUser('ULEAD', TOPIC_PERMS, OWN);
	customCalls.remove.length = 0;
	const r = await call(lead, 'DELETE', '/TLEG/members/TVTOTHER_02');
	assert.equal(r.status, 404);
	assert.equal(customCalls.remove.length, 0);
});

test('L-11 (đối chứng): xóa thành viên đúng đề tài ⇒ 200 và xóa trường tùy chỉnh của chính dòng đó', async () => {
	const lead = mkUser('ULEAD', TOPIC_PERMS, OWN);
	customCalls.remove.length = 0;
	const r = await call(lead, 'DELETE', '/TLEG/members/M2');
	assert.equal(r.status, 200);
	assert.deepEqual(customCalls.remove, [['topic_member', 'M2']]);
});

// ─── L-12 ───────────────────────────────────────────────────────────────────
const legacyData = {
	title: 'Đề tài đã xong',
	round_id: 'R1',
	category_id: 'C1',
	department_id: 'K1',
	members: [{ ho_ten: 'Chủ nhiệm', role: 'leader', user_id: 'ULEAD' }],
};
const stubLegacyDeps = () => {
	const memberService = require('../../src/modules/topics/topicMemberService');
	memberService.addMember = async () => ({ id: 'MNEW' });
	topicService.getById = async () => ({ id: 'TNEW', title: 'x', members: [] });
};
test('L-12: tài khoản phạm vi own không nhập legacy vào đợt đang mở / còn hạn đăng ký', async () => {
	stubLegacyDeps();
	const lead = mkUser('ULEAD', TOPIC_PERMS, OWN);
	created.length = 0;
	// đợt đang diễn ra, chưa cấu hình mốc đăng ký
	state.round = { id: 'R1', name: 'Đợt 1', status: 'open', end_date: day(60) };
	state.regDeadlines = [];
	await assert.rejects(topicLegacyService.create(legacyData, lead), { statusCode: 403 });
	// còn trong hạn đăng ký
	state.regDeadlines = [{ start_date: day(-5), deadline_date: day(5) }];
	await assert.rejects(topicLegacyService.create(legacyData, lead), { statusCode: 403 });
	assert.equal(created.length, 0);
});

test('L-12 (đối chứng): đợt đã đóng / đã kết thúc / đã qua hạn đăng ký thì nhập được; phạm vi all không bị ràng buộc', async () => {
	stubLegacyDeps();
	const lead = mkUser('ULEAD', TOPIC_PERMS, OWN);
	created.length = 0;
	state.regDeadlines = [];
	state.round = { id: 'R1', name: 'Đợt 1', status: 'closed', end_date: day(60) };
	await topicLegacyService.create(legacyData, lead);
	state.round = { id: 'R1', name: 'Đợt 1', status: 'open', end_date: day(-30) };
	await topicLegacyService.create(legacyData, lead);
	state.round = { id: 'R1', name: 'Đợt 1', status: 'open', end_date: day(60) };
	state.regDeadlines = [{ start_date: day(-50), deadline_date: day(-10) }];
	await topicLegacyService.create(legacyData, lead);
	assert.equal(created.length, 3);
	// người quản lý toàn viện nhập vào đợt đang mở vẫn được
	state.regDeadlines = [{ start_date: day(-5), deadline_date: day(5) }];
	const all = mkUser('UALL', TOPIC_PERMS, { ...ALL, 'topics:create': 'all' });
	await topicLegacyService.create(
		{ ...legacyData, members: [{ ho_ten: 'Chủ nhiệm', role: 'leader' }] },
		all,
	);
	assert.equal(created.length, 4);
});

// ─── L-13 ───────────────────────────────────────────────────────────────────
const ADMIN_PERMS = [...TOPIC_PERMS, 'topics:approve'];
const adminScopes = { 'topics:read': 'all', 'topics:update': 'all', 'topics:approve': 'all' };

test('L-13: có quy trình duyệt active thì PUT không đổi được status (trừ workflows:manage)', async () => {
	const admin = mkUser('UADM', ADMIN_PERMS, adminScopes, { role_id: 'VT09' });
	state.workflowActive = true;
	let from = log.length;
	const r = await call(admin, 'PUT', '/TK1', { status: 'approved' });
	assert.equal(r.status, 409);
	assert.equal(wrote(from, /UPDATE topics SET/).length, 0);
	// quyết định 'supplement' qua đường PUT cũng bị chặn
	assert.equal((await call(admin, 'PUT', '/TK1', { status: 'supplement' })).status, 409);
	// có workflows:manage thì sửa dữ liệu trực tiếp được
	const superAdmin = mkUser('USUP', [...ADMIN_PERMS, 'workflows:manage'], adminScopes);
	from = log.length;
	assert.equal((await call(superAdmin, 'PUT', '/TK1', { status: 'approved' })).status, 200);
	assert.match(wrote(from, /UPDATE topics SET/)[0].text, /status = @status/);
});

test('L-13 (đối chứng): form sửa gửi lại đúng status hiện tại vẫn lưu được các trường khác; không có quy trình thì PUT status như cũ', async () => {
	const admin = mkUser('UADM', ADMIN_PERMS, adminScopes, { role_id: 'VT09' });
	state.workflowActive = true;
	let from = log.length;
	const r = await call(admin, 'PUT', '/TK1', { status: 'submitted', title: 'Tên mới' });
	assert.equal(r.status, 200);
	const upd = wrote(from, /UPDATE topics SET/)[0];
	assert.match(upd.text, /title = @title/);
	assert.doesNotMatch(upd.text, /status = @status/);
	state.workflowActive = false;
	from = log.length;
	assert.equal((await call(admin, 'PUT', '/TK1', { status: 'approved' })).status, 200);
	assert.match(wrote(from, /UPDATE topics SET/)[0].text, /status = @status/);
});

test("L-13: 'supplement' qua /approve khi có quy trình active phải đúng người được phân công", async () => {
	state.workflowActive = true;
	state.workflowTask = { id: 'WFT1', assignee_role_id: 'VT02' };
	const council = mkUser(
		'UCOUNCIL',
		['topics:approve'],
		{ 'topics:approve': 'all' },
		{ role_id: 'VT04' },
	);
	approvalCalls.length = 0;
	const denied = await call(council, 'POST', '/TK1/approve', {
		status: 'supplement',
		comment: 'x',
	});
	assert.equal(denied.status, 403);
	assert.equal(approvalCalls.length, 0);
	// đối chứng: đúng vai trò được phân công (giám đốc) ⇒ qua
	const director = mkUser(
		'UDIR',
		['topics:approve'],
		{ 'topics:approve': 'all' },
		{ role_id: 'VT02' },
	);
	assert.equal(
		(await call(director, 'POST', '/TK1/approve', { status: 'supplement' })).status,
		200,
	);
	assert.equal(approvalCalls.length, 1);
	// workflows:manage cũng qua
	const manager = mkUser(
		'UMGR',
		['topics:approve', 'workflows:manage'],
		{ 'topics:approve': 'all' },
		{ role_id: 'VT04' },
	);
	assert.equal((await call(manager, 'POST', '/TK1/approve', { status: 'supplement' })).status, 200);
	// không có quy trình active ⇒ đường duyệt cũ, ai có topics:approve cũng được
	state.workflowActive = false;
	assert.equal((await call(council, 'POST', '/TK1/approve', { status: 'supplement' })).status, 200);
});
