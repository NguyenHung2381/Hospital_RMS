// Hồi quy M-07 (audit run-4): người sửa khóa học (courses:update, kể cả phạm vi 'assigned') không
// được tự cấp CME đã duyệt qua giờ giảng + khóa điểm khi thiếu cme_records:manage.
//   - khóa điểm / "Ghi lại CME" ghi dòng CME giảng viên 'pending' nếu người gọi không có
//     cme_records:manage, 'approved' nếu có (hành vi của vai trò seed giữ nguyên);
//   - ON CONFLICT giữ 'rejected', không xóa lý do từ chối; người không có quyền duyệt
//     không xóa được dòng đã duyệt của GV khác;
//   - số tiết giảng bị chặn trên theo số tiết của bài / chương trình;
//   - "Ghi lại CME" báo lecturers_pending khi dòng giảng viên còn chờ duyệt;
//   - dòng giảng viên chia tiết theo buổi đã dạy, danh mục DT_KHOAHOC (Phụ lục I mục 1.1).
// Chạy cả ứng dụng (router + authorizePermission + controller + service) trên CSDL giả.
process.env.JWT_SECRET = 'test-secret';
require('../../scripts/lib/static-check-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const ROLES = {
	// vai trò tùy biến: sửa khóa phạm vi 'assigned', KHÔNG có cme_records:manage
	RLEC: [
		{ resource: 'courses', action: 'read', scope: 'assigned' },
		{ resource: 'courses', action: 'update', scope: 'assigned' },
	],
	// như vai trò seed: courses:update/approve + cme_records:manage
	RMGR: [
		{ resource: 'courses', action: 'read', scope: 'all' },
		{ resource: 'courses', action: 'update', scope: 'all' },
		{ resource: 'courses', action: 'approve', scope: 'all' },
		{ resource: 'cme_records', action: 'manage', scope: 'all' },
	],
	// courses:approve nhưng không có cme_records:manage
	RAPP: [
		{ resource: 'courses', action: 'read', scope: 'all' },
		{ resource: 'courses', action: 'approve', scope: 'all' },
	],
};
const USERS = { ULEC1: 'RLEC', UMGR: 'RMGR', UAPP: 'RAPP' };
const LESSON_HOURS = 10;
const COURSE_HOURS = 100;

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
	if (/FROM courses c WHERE c.id = @id AND EXISTS/.test(text))
		return inputs.id === 'KH0001' && inputs.actor_id === 'ULEC1' ? [{ ok: 1 }] : [];
	if (
		/FROM lecturers l\s+LEFT JOIN users u ON u.id = l.user_id\s+WHERE l.id = @lecturer_id/.test(
			text,
		)
	)
		return [{ full_name: 'GV1', is_active: true, role_id: 'RLEC', enrolled: 0 }];
	if (
		/JOIN lesson_programs lp ON lp.program_id = cp.program_id/.test(text) &&
		/SELECT 1 AS ok/.test(text)
	)
		return [{ ok: 1 }];
	// trần số tiết
	if (/FROM program_lessons WHERE id = @lesson_id/.test(text)) return [{ max_hours: LESSON_HOURS }];
	if (/FROM course_programs cp JOIN training_programs tp/.test(text))
		return [{ max_hours: COURSE_HOURS }];
	if (/SELECT @new_id AS id/.test(text)) return [{ id: 'PC000000000001' }];
	if (/SELECT e.id AS enrollment_id/.test(text))
		return [
			{
				enrollment_id: 'E1',
				trainee_id: 'T1',
				trainee_name: 'HV',
				program_id: 'P1',
				status: 'approved',
			},
		];
	if (/FROM grades g WHERE g.enrollment_id = @enrollment_id AND g.subject_id IS NULL/.test(text))
		return [{ id: 'G1', locked_at: null }];
	if (/LEFT JOIN grades g ON g.enrollment_id = e.id AND g.subject_id IS NULL/.test(text))
		return [{ total: 1, locked: 1 }];
	// Dữ kiện giờ giảng (courseCmeService.LECTURER_FACTS): GV1 dạy 2/4 buổi đã diễn ra của bài 10 tiết
	if (/WITH sess AS/.test(text) && /FROM class_sessions cs/.test(text))
		return [
			{
				lesson_id: 'L1',
				user_id: 'ULEC1',
				role: 'assistant',
				assigned_hours: null,
				lesson_hours: LESSON_HOURS,
				sessions: '2',
				lesson_sessions: '4',
			},
		];
	// RETURNING tgt.approval_status: dòng chèn mới mang đúng trạng thái câu INSERT ghi
	if (/INSERT INTO cme_records/.test(text)) {
		// chế độ cộng thẳng, người gọi thiếu quyền: dòng của chính người gọi 'pending'
		if (/CASE WHEN src\.user_id = @actor_id THEN 'pending' ELSE 'approved' END/.test(text))
			return JSON.parse(inputs.rows).map((x) => ({
				approval_status: x.user_id === inputs.actor_id ? 'pending' : 'approved',
			}));
		return [{ approval_status: /'pending', NULL, NULL/.test(text) ? 'pending' : 'approved' }];
	}
	return [];
});

const { signToken } = require('../../src/utils/keys');
const app = require('../../src/app');

// Cấu hình chế độ duyệt (CME_TRAINEE_APPROVAL / CME_LECTURER_APPROVAL) cho từng test; trống =
// mặc định. courseCmeService gọi systemSettingService.getValue qua đối tượng module ⇒ thay được.
const settingSvc = require('../../src/modules/settings/systemSettingService');
const settings = {};
const realGetValue = settingSvc.getValue;
settingSvc.getValue = async (key, fallback) =>
	key in settings ? settings[key] : realGetValue(key, fallback);
test.afterEach(() => {
	for (const k of Object.keys(settings)) delete settings[k];
});

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
	return { status: res.status, body: await res.json(), entries: log.slice(n) };
};
const lecturerUpsert = (entries) =>
	entries.find((e) => /INSERT INTO cme_records/.test(e.text) && /course_lecturer/.test(e.text));
const lecturerDelete = (entries) => entries.find((e) => /DELETE FROM cme_records/.test(e.text));
const normalize = (t) => t.replace(/\s+/g, ' ');

test('M-07: khóa điểm bởi người không có cme_records:manage → CME giảng viên chỉ "pending"', async () => {
	const r = await call('ULEC1', 'POST', '/courses/KH0001/grades/lock');
	assert.equal(r.status, 200);
	const up = lecturerUpsert(r.entries);
	assert.ok(up, 'phải có câu upsert cme_records của giảng viên');
	const t = normalize(up.text);
	// chèn mới: 'pending', không ghi người duyệt
	assert.match(t, /'pending'/);
	assert.doesNotMatch(t, /SELECT[^]*?'approved', @actor_id/); // không còn 'approved' + reviewed_by của người gọi
	assert.match(t, /'pending', NULL, NULL, 'course_lecturer'/);
	// conflict: giữ 'rejected', không xóa lý do từ chối, không tự nâng lên 'approved' khi tín chỉ đổi
	const conflict = t.slice(t.indexOf('ON CONFLICT'));
	assert.match(conflict, /CASE WHEN tgt\.approval_status = 'rejected' THEN 'rejected'/);
	assert.match(conflict, /tgt\.credits = EXCLUDED\.credits THEN 'approved' ELSE 'pending'/);
	assert.match(conflict, /reject_reason = tgt\.reject_reason/);
	assert.doesNotMatch(conflict, /reject_reason = NULL/);
	// không xóa được dòng đã duyệt / từ chối của GV khác
	assert.match(normalize(lecturerDelete(r.entries).text), /approval_status = 'pending'/);
});

test('M-07: khóa điểm lặp lại không hoàn tác lời từ chối (conflict giữ rejected)', async () => {
	for (let i = 0; i < 2; i++) {
		const r = await call('ULEC1', 'POST', '/courses/KH0001/grades/lock');
		assert.equal(r.status, 200);
		assert.match(normalize(lecturerUpsert(r.entries).text), /THEN 'rejected'/);
	}
});

test('M-07 đối chứng: người có cme_records:manage khóa điểm → CME giảng viên "approved" như trước', async () => {
	const r = await call('UMGR', 'POST', '/courses/KH0001/grades/lock');
	assert.equal(r.status, 200);
	const t = normalize(lecturerUpsert(r.entries).text);
	assert.match(t, /'approved', @actor_id/);
	const conflict = t.slice(t.indexOf('ON CONFLICT'));
	assert.match(conflict, /ELSE 'approved' END/);
	assert.match(conflict, /THEN 'rejected'/); // lời từ chối vẫn được giữ cả với người quản lý
	// người quản lý được dọn cả dòng đã duyệt của GV bị gỡ phân công
	assert.doesNotMatch(normalize(lecturerDelete(r.entries).text), /approval_status = 'pending'/);
});

test('M-07: "Ghi lại CME" (courses:approve) không có cme_records:manage → dòng giảng viên "pending"', async () => {
	const r = await call('UAPP', 'POST', '/courses/KH0001/cme-sync');
	assert.equal(r.status, 200);
	const up = lecturerUpsert(r.entries);
	assert.ok(up);
	assert.match(normalize(up.text), /'pending'/);
	assert.doesNotMatch(normalize(up.text), /'approved', @actor_id/);
	// giao diện được báo dòng giảng viên còn chờ người quản lý CME duyệt; các trường cũ giữ nguyên
	assert.equal(r.body.data.lecturers_pending, true);
	assert.equal(r.body.data.lecturers, 1);
	assert.equal(r.body.data.grades_locked, true);
	assert.equal(r.body.data.lecturer_enabled, true);
	assert.equal(r.body.data.trainee_enabled, true);
	assert.ok('trainees' in r.body.data);
});

test('M-07: "Ghi lại CME" bởi người quản lý CME → "approved"', async () => {
	const r = await call('UMGR', 'POST', '/courses/KH0001/cme-sync');
	assert.equal(r.status, 200);
	assert.match(normalize(lecturerUpsert(r.entries).text), /'approved', @actor_id/);
	assert.equal(r.body.data.lecturers_pending, false);
});

test('A2: dòng giảng viên tính theo buổi đã dạy (GV phụ chưa nhập số tiết vẫn được cộng), mục DT_KHOAHOC', async () => {
	const r = await call('ULEC1', 'POST', '/courses/KH0001/grades/lock');
	assert.equal(r.status, 200);
	const up = lecturerUpsert(r.entries);
	// 10 tiết × 2/4 buổi = 5 tiết, truyền vào câu ghi qua @rows (JSON)
	const rows = JSON.parse(up.inputs.rows);
	assert.deepEqual(
		rows.map((x) => [x.user_id, x.hours]),
		[['ULEC1', 5]],
	);
	assert.match(rows[0].note, /chia theo 2 buổi đã dạy 5/);
	// danh mục Phụ lục I mục 1.1 (không còn GIANGDAY), hệ số lấy theo đúng danh mục đó
	const t = normalize(up.text);
	assert.match(t, /'DT_KHOAHOC' AS category_id/);
	assert.match(t, /WHERE id = 'DT_KHOAHOC'/);
	assert.doesNotMatch(t, /GIANGDAY/);
	// conflict ghi đè category_id ⇒ dòng cũ GIANGDAY được đổi khi chạy lại
	assert.match(t.slice(t.indexOf('ON CONFLICT')), /category_id = EXCLUDED\.category_id/);
	// câu xóa dòng GV không còn giờ giảng dùng cùng danh sách
	assert.equal(lecturerDelete(r.entries).inputs.rows, up.inputs.rows);
});

// ─── Chế độ duyệt dòng tự cộng (TT 32/2023 Điều 9 khoản 1, 4; Điều 6.2.c) ────────────────────

test('CME_LECTURER_APPROVAL=pending: cả người quản lý CME khóa điểm cũng chỉ ghi "pending"', async () => {
	settings.CME_LECTURER_APPROVAL = 'pending';
	const r = await call('UMGR', 'POST', '/courses/KH0001/cme-sync');
	assert.equal(r.status, 200);
	const t = normalize(lecturerUpsert(r.entries).text);
	assert.match(t, /'pending', NULL, NULL, 'course_lecturer'/);
	assert.doesNotMatch(t, /'approved', @actor_id/);
	const conflict = t.slice(t.indexOf('ON CONFLICT'));
	assert.match(conflict, /THEN 'rejected'/);
	assert.match(conflict, /ELSE 'pending' END/);
	assert.equal(r.body.data.lecturers_pending, true);
	// quyền dọn dòng đã duyệt của GV bị gỡ phân công vẫn theo cme_records:manage
	assert.doesNotMatch(normalize(lecturerDelete(r.entries).text), /approval_status = 'pending'/);
});

test('CME_LECTURER_APPROVAL=approved: người thiếu quyền không tự duyệt được dòng của chính mình', async () => {
	settings.CME_LECTURER_APPROVAL = 'approved';
	const r = await call('ULEC1', 'POST', '/courses/KH0001/grades/lock');
	assert.equal(r.status, 200);
	const t = normalize(lecturerUpsert(r.entries).text);
	assert.match(t, /CASE WHEN src\.user_id = @actor_id THEN 'pending' ELSE 'approved' END/);
	assert.match(t, /CASE WHEN src\.user_id = @actor_id THEN NULL ELSE @actor_id END/);
	const conflict = t.slice(t.indexOf('ON CONFLICT'));
	// lời từ chối vẫn giữ; nâng lên 'approved' chỉ theo trạng thái câu INSERT (không phải dòng của mình)
	assert.match(
		conflict,
		/CASE WHEN tgt\.approval_status = 'rejected' THEN 'rejected' WHEN EXCLUDED\.approval_status = 'approved' THEN 'approved'/,
	);
	assert.match(conflict, /reject_reason = tgt\.reject_reason/);
	// người thiếu quyền vẫn chỉ dọn được dòng 'pending'
	assert.match(normalize(lecturerDelete(r.entries).text), /approval_status = 'pending'/);
});

test('CME_LECTURER_APPROVAL=approved: "Ghi lại CME" cho GV khác → đã duyệt, không báo chờ', async () => {
	settings.CME_LECTURER_APPROVAL = 'approved';
	// UAPP không phải giảng viên của khóa (dòng duy nhất là ULEC1)
	let r = await call('UAPP', 'POST', '/courses/KH0001/cme-sync');
	assert.equal(r.status, 200);
	assert.equal(r.body.data.lecturers, 1);
	assert.equal(r.body.data.lecturers_pending, false);
	r = await call('UMGR', 'POST', '/courses/KH0001/cme-sync');
	// người quản lý CME: duyệt thẳng như cũ
	assert.match(normalize(lecturerUpsert(r.entries).text), /'approved', @actor_id/);
	assert.equal(r.body.data.lecturers_pending, false);
});

test('CME_TRAINEE_APPROVAL=pending: dòng học viên theo giấy chứng nhận chờ duyệt', async () => {
	const traineeUpsert = (entries) =>
		entries.find((e) => /INSERT INTO cme_records/.test(e.text) && /course_trainee/.test(e.text));
	// mặc định: duyệt thẳng như trước
	let r = await call('UMGR', 'POST', '/courses/KH0001/cme-sync');
	let t = normalize(traineeUpsert(r.entries).text);
	assert.match(t, /'approved', @actor_id/);
	assert.match(t.slice(t.indexOf('ON CONFLICT')), /approval_status = 'approved'/);
	assert.equal(r.body.data.trainees_pending, false);

	settings.CME_TRAINEE_APPROVAL = 'pending';
	r = await call('UMGR', 'POST', '/courses/KH0001/cme-sync');
	assert.equal(r.status, 200);
	t = normalize(traineeUpsert(r.entries).text);
	assert.match(t, /'pending', NULL, NULL, 'course_trainee'/);
	const conflict = t.slice(t.indexOf('ON CONFLICT'));
	// cấp lại giấy sau thu hồi: 'rejected' về 'pending' (không giữ), đã duyệt + tín chỉ không đổi thì giữ
	assert.match(conflict, /tgt\.credits = EXCLUDED\.credits THEN 'approved' ELSE 'pending' END/);
	assert.doesNotMatch(conflict, /THEN 'rejected'/);
	assert.match(conflict, /reject_reason = NULL/);
	assert.equal(r.body.data.trainees_pending, true);
});

test('Cấu hình chế độ duyệt chỉ nhận giá trị liệt kê', () => {
	const v = settingSvc.validateSetting;
	for (const ok of ['approved', 'pending', '', null])
		assert.equal(v('CME_TRAINEE_APPROVAL', ok), null);
	for (const ok of ['permission', 'approved', 'pending'])
		assert.equal(v('CME_LECTURER_APPROVAL', ok), null);
	assert.match(v('CME_TRAINEE_APPROVAL', 'permission') ?? '', /approved\/pending/);
	assert.match(v('CME_LECTURER_APPROVAL', 'yes') ?? '', /permission\/approved\/pending/);
	assert.ok(settingSvc.isKey('CME_TRAINEE_APPROVAL'));
	assert.ok(settingSvc.isKey('CME_LECTURER_APPROVAL'));
});

test('M-07: số tiết của bài bị chặn trên theo số tiết bài học (lesson-lecturers)', async () => {
	let r = await call('ULEC1', 'PUT', '/courses/KH0001/lesson-lecturers', {
		lesson_id: 'L1',
		main: { lecturer_id: 'LEC1', hours: 9000 },
	});
	assert.equal(r.status, 400);
	assert.ok(!r.entries.some((e) => /INSERT INTO lecturer_assignments/.test(e.text)));

	// phụ trợ cũng bị chặn
	r = await call('ULEC1', 'PUT', '/courses/KH0001/lesson-lecturers', {
		lesson_id: 'L1',
		assistants: [{ lecturer_id: 'LEC1', hours: LESSON_HOURS + 1 }],
	});
	assert.equal(r.status, 400);

	// đối chứng: đúng bằng số tiết bài → hợp lệ
	r = await call('ULEC1', 'PUT', '/courses/KH0001/lesson-lecturers', {
		lesson_id: 'L1',
		main: { lecturer_id: 'LEC1', hours: LESSON_HOURS },
	});
	assert.equal(r.status, 200);
	const ins = r.entries.find((e) => /INSERT INTO lecturer_assignments/.test(e.text));
	assert.equal(ins.inputs.hours, LESSON_HOURS);
});

test('M-07: số tiết phân công (lecturer-assignments) bị chặn trên theo bài / chương trình', async () => {
	// gắn bài: trần = số tiết bài
	let r = await call('ULEC1', 'POST', '/courses/KH0001/lecturer-assignments', {
		lecturer_id: 'LEC1',
		subject_id: 'L1',
		role: 'main',
		hours: 500,
	});
	assert.equal(r.status, 400);
	// cả khóa: trần = tổng số tiết các chương trình của khóa
	r = await call('ULEC1', 'POST', '/courses/KH0001/lecturer-assignments', {
		lecturer_id: 'LEC1',
		role: 'main',
		hours: COURSE_HOURS + 1,
	});
	assert.equal(r.status, 400);
	assert.ok(!r.entries.some((e) => /INSERT INTO lecturer_assignments/.test(e.text)));

	// đối chứng hợp lệ + không nhập số tiết vẫn được
	r = await call('ULEC1', 'POST', '/courses/KH0001/lecturer-assignments', {
		lecturer_id: 'LEC1',
		subject_id: 'L1',
		role: 'main',
		hours: LESSON_HOURS,
	});
	assert.equal(r.status, 201);
	r = await call('ULEC1', 'POST', '/courses/KH0001/lecturer-assignments', {
		lecturer_id: 'LEC1',
		role: 'main',
	});
	assert.equal(r.status, 201);
});
