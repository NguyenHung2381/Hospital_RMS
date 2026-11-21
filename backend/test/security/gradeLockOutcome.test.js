// Hồi quy L-11 (audit run-5): kết quả đã khóa sổ điểm không đổi được khi thiếu grades:unlock
// bằng cách sửa điểm danh / đổi chương trình rồi khóa lại.
//   - sửa trạng thái điểm danh (tay, hàng loạt) của lượt ghi danh đã khóa điểm ⇒ 409, không ghi;
//     lưu lại đúng trạng thái cũ (chỉ sửa ghi chú) vẫn được;
//   - đổi chương trình của lượt đã khóa ⇒ 409;
//   - khóa lại chỉ tính lại dòng vừa khóa, dòng đã khóa giữ kết quả đã lưu;
//   - cấp giấy chứng nhận dùng kết quả ĐÃ LƯU lúc khóa, không phải kết quả tính lại.
// Chạy cả ứng dụng (router + authorizePermission + controller + service) trên CSDL giả.
process.env.JWT_SECRET = 'test-secret';
require('../../scripts/lib/static-check-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const ROLES = {
	// như research_manager seed: courses:update/approve, KHÔNG có grades:unlock
	RMGR: [
		{ resource: 'courses', action: 'read', scope: 'all' },
		{ resource: 'courses', action: 'update', scope: 'all' },
		{ resource: 'courses', action: 'approve', scope: 'all' },
	],
};
const USERS = { UMGR: 'RMGR' };

// Điểm tổng (grades, subject_id NULL) theo lượt ghi danh
const GRADES = {
	E_LOCKED: { id: 'G_LOCKED', locked_at: new Date('2026-11-01T00:00:00Z') },
	E_OPEN: { id: 'G_OPEN', locked_at: null },
};
// Dòng bảng điểm (loadRows): E_LOCKED đã khóa với kết quả lưu là Trượt, nhưng điểm danh / điểm
// hiện tại tính ra Đạt (đầu vào đã bị đổi sau khi khóa)
const baseRow = {
	trainee_id: 'T1',
	program_id: 'P1',
	program_name: 'CT',
	theory_hours: 10,
	practice_hours: 0,
	exam_parts: null,
	theory_score: 9,
	practice_score: null,
	theory_flag: null,
	practice_flag: null,
	theory_attempt: 1,
	practice_attempt: 1,
	note: null,
	entrance_score: null,
	certificate_id: null,
};
const ROWS = {
	E_LOCKED: {
		...baseRow,
		enrollment_id: 'E_LOCKED',
		trainee_name: 'HV khoa',
		grade_id: 'G_LOCKED',
		score: 4,
		result: 'fail',
		classification: 'Kém',
		locked_at: GRADES.E_LOCKED.locked_at,
	},
	E_OPEN: {
		...baseRow,
		enrollment_id: 'E_OPEN',
		trainee_name: 'HV mo',
		grade_id: 'G_OPEN',
		score: null,
		result: null,
		classification: null,
		locked_at: null,
	},
};
// Trạng thái điểm danh hiện có ở buổi S1
const ATTENDANCE = { E_LOCKED: 'absent', E_OPEN: 'absent' };

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
	// gradebookService.lockedEnrollmentIds
	if (/SELECT enrollment_id FROM grades/.test(text))
		return JSON.parse(inputs.ids)
			.filter((id) => GRADES[id]?.locked_at)
			.map((enrollment_id) => ({ enrollment_id }));
	if (/SELECT enrollment_id, status FROM attendance/.test(text))
		return JSON.parse(inputs.ids).map((id) => ({ enrollment_id: id, status: ATTENDANCE[id] }));
	// danh sách lớp của buổi
	if (/SELECT e\.id\s+FROM class_sessions sess/.test(text))
		return [{ id: 'E_LOCKED' }, { id: 'E_OPEN' }];
	if (/SELECT 1 AS x FROM attendance WHERE session_id/.test(text)) return [{ x: 1 }];
	// enrollmentProgramService.updateEnrollment
	if (/SELECT id, course_id, program_id FROM course_enrollments WHERE id = @id/.test(text))
		return GRADES[inputs.id] ? [{ id: inputs.id, course_id: 'KH1', program_id: 'P1' }] : [];
	if (/SELECT 1 AS ok FROM course_programs/.test(text)) return [{ ok: 1 }];
	// gradebookService.loadRows
	if (/SELECT e\.id AS enrollment_id, e\.trainee_id, t\.full_name AS trainee_name/.test(text)) {
		const only = Object.keys(inputs)
			.filter((k) => /^e\d+$/.test(k))
			.map((k) => inputs[k]);
		return Object.values(ROWS).filter((r) => !only.length || only.includes(r.enrollment_id));
	}
	// ensureGradeRow
	if (/FROM grades g WHERE g\.enrollment_id = @enrollment_id AND g\.subject_id IS NULL/.test(text))
		return GRADES[inputs.enrollment_id] ? [GRADES[inputs.enrollment_id]] : [];
	// certificateRepository
	if (/FROM course_enrollments/.test(text) && /training_type_id/.test(text))
		return [{ course_id: 'KH1', training_type_id: 'TRNTP-DTLT', is_rolling: false }];
	if (/SELECT status FROM course_enrollments/.test(text)) return [{ status: 'approved' }];
	return [];
});

const { signToken } = require('../../src/utils/keys');
const app = require('../../src/app');
const gradebookService = require('../../src/modules/training/courses/gradebookService');

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
const attendanceWrites = (entries) =>
	entries.filter((e) => /UPDATE attendance SET|INSERT INTO attendance/.test(e.text));

test('L-11: đổi trạng thái điểm danh của lượt đã khóa điểm → 409, không ghi dòng nào của cả lô', async () => {
	const r = await call('UMGR', 'PUT', '/courses/sessions/S1/attendance', {
		records: [
			{ enrollment_id: 'E_OPEN', status: 'present' },
			{ enrollment_id: 'E_LOCKED', status: 'present' },
		],
	});
	assert.equal(r.status, 409);
	assert.match(r.body.message, /đã khóa/);
	assert.deepEqual(attendanceWrites(r.entries), []);
});

test('L-11: lưu lại đúng trạng thái cũ của lượt đã khóa (chỉ sửa ghi chú) vẫn được', async () => {
	const r = await call('UMGR', 'PUT', '/courses/sessions/S1/attendance', {
		records: [{ enrollment_id: 'E_LOCKED', status: 'absent', note: 'ốm' }],
	});
	assert.equal(r.status, 200);
	assert.equal(attendanceWrites(r.entries).length, 1);
});

test('L-11 đối chứng: lượt chưa khóa vẫn sửa điểm danh được', async () => {
	const r = await call('UMGR', 'PUT', '/courses/sessions/S1/attendance', {
		records: [{ enrollment_id: 'E_OPEN', status: 'present' }],
	});
	assert.equal(r.status, 200);
	assert.equal(attendanceWrites(r.entries).length, 1);
});

test('L-11: đổi chương trình của lượt đã khóa điểm → 409, không ghi', async () => {
	const r = await call('UMGR', 'PUT', '/courses/enrollments/E_LOCKED', { program_id: 'P2' });
	assert.equal(r.status, 409);
	assert.ok(!r.entries.some((e) => /UPDATE course_enrollments SET/.test(e.text)));

	const ok = await call('UMGR', 'PUT', '/courses/enrollments/E_OPEN', { program_id: 'P2' });
	assert.equal(ok.status, 200);
	assert.ok(ok.entries.some((e) => /UPDATE course_enrollments SET/.test(e.text)));
});

test('L-11: khóa lại chỉ tính lại dòng vừa khóa, không ghi đè kết quả đã khóa', async () => {
	const r = await call('UMGR', 'POST', '/courses/KH1/grades/lock');
	assert.equal(r.status, 200);
	const up = r.entries.find((e) => /UPDATE grades SET score = j\.score/.test(e.text));
	assert.ok(up, 'phải tính lại dòng vừa khóa');
	assert.deepEqual(
		JSON.parse(up.inputs.rows).map((x) => x.id),
		['G_OPEN'],
	);
});

test('L-11: kết quả khi cấp giấy là kết quả ĐÃ LƯU lúc khóa (Trượt), không phải kết quả tính lại', async () => {
	const out = await gradebookService.enrollmentOutcome('KH1', 'E_LOCKED');
	assert.equal(out.locked, true);
	assert.equal(out.result, 'fail');
	// đối chứng: cùng dữ liệu nhưng chưa khóa thì tính ra Đạt
	const open = await gradebookService.enrollmentOutcome('KH1', 'E_OPEN');
	assert.equal(open.result, 'pass');

	const r = await call('UMGR', 'POST', '/courses/certificates', { enrollment_id: 'E_LOCKED' });
	assert.equal(r.status, 409);
	assert.ok(!r.entries.some((e) => /INSERT INTO certificates/.test(e.text)));
});
