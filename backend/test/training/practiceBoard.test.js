// Tổng hợp thực hành GPHN theo khoa / người hướng dẫn (practiceBoardService):
// gom nhóm thuần + câu truy vấn (lọc ngày, khoa, NHD, phạm vi 'assigned').
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

let boardRows = [];
let settings = [];
const log = install(async (text) => {
	if (/FROM system_settings/.test(text)) return settings;
	if (/FROM enrollment_rotations r/.test(text)) return boardRows;
	return [];
});
const { groupBoard, getBoard } = require('../../src/modules/training/courses/practiceBoardService');

const row = (id, enrollment, trainee, dept, mentor, extra = {}) => ({
	id,
	enrollment_id: enrollment,
	trainee_name: trainee,
	department_id: dept?.[0] ?? null,
	department_name: dept?.[1] ?? null,
	current_department_name: dept?.[1] ?? null,
	mentor_user_id: mentor?.[0] ?? null,
	mentor_name: mentor?.[1] ?? null,
	...extra,
});
const CC = ['D_CC', 'Khoa Cấp Cứu'];
const NOI = ['D_NOI', 'Khoa Nội'];
const AN = ['U1', 'BS An'];
const BINH = ['U2', 'BS Bình'];

test('groupBoard: theo khoa, theo NHD, đếm học viên khác nhau và vượt ngưỡng', () => {
	const rows = [
		row('r1', 'E1', 'Trần C', CC, AN),
		row('r2', 'E2', 'Lê A', CC, AN),
		row('r3', 'E3', 'Phạm B', NOI, AN),
		// cùng học viên E3, 2 dòng cùng NHD (vòng chia nhiều khoa) — tính 1
		row('r4', 'E3', 'Phạm B', CC, AN),
		row('r5', 'E4', 'Vũ D', NOI, BINH),
		row('r6', 'E5', 'Đỗ E', null, null),
	];
	const out = groupBoard(rows, 2);

	assert.deepEqual(
		out.departments.map((d) => [d.name, d.trainee_count, d.rows.map((r) => r.trainee_name)]),
		[
			['Khoa Cấp Cứu', 3, ['Lê A', 'Phạm B', 'Trần C']],
			['Khoa Nội', 2, ['Phạm B', 'Vũ D']],
			['Chưa chọn khoa', 1, ['Đỗ E']],
		],
	);
	assert.deepEqual(
		out.mentors.map((m) => [m.name, m.trainee_count, m.over_limit]),
		[
			['BS An', 3, true],
			['BS Bình', 1, false],
			['Chưa phân công NHD', 1, false],
		],
	);
	assert.deepEqual(out.mentors[0].departments, ['Khoa Cấp Cứu', 'Khoa Nội']);
	assert.deepEqual(out.summary, {
		trainee_count: 5,
		department_count: 2,
		mentor_count: 2,
		over_limit_count: 1,
		unassigned_mentor_count: 1,
	});
});

test('groupBoard: vòng nhập từ sổ cũ chưa khớp mã — nhóm theo tên bản chụp', () => {
	const out = groupBoard(
		[
			row('r1', 'E1', 'A', [null, 'Nội hô hấp'], [null, 'BS Cũ']),
			row('r2', 'E2', 'B', [null, 'Nội hô hấp'], [null, 'BS Cũ']),
		],
		1,
	);
	assert.equal(out.departments.length, 1);
	assert.equal(out.departments[0].name, 'Nội hô hấp');
	assert.equal(out.mentors[0].name, 'BS Cũ');
	assert.equal(out.mentors[0].trainee_count, 2);
	assert.equal(out.mentors[0].over_limit, true);
});

const actor = (id, scope) => ({
	id,
	permissions: new Set(['courses:read']),
	permissionScopes: new Map([['courses:read', scope]]),
});
const boardQuery = () => log.filter((q) => /FROM enrollment_rotations r/.test(q.text)).at(-1);

test('getBoard: lọc vòng đang diễn ra vào ngày, bỏ vòng không đạt / hồ sơ nghỉ', async () => {
	boardRows = [row('r1', 'E1', 'A', CC, AN)];
	settings = [{ setting_key: 'PRACTICE_MENTOR_MAX_TRAINEES', value: '3' }];
	const out = await getBoard(
		{ date: '2026-10-19', department_id: 'D_CC', mentor_user_id: 'U1' },
		actor('QL', 'all'),
	);
	const q = boardQuery();
	assert.equal(q.inputs.date, '2026-10-19');
	assert.equal(q.inputs.department_id, 'D_CC');
	assert.equal(q.inputs.mentor_user_id, 'U1');
	assert.match(q.text, /r\.start_date <= @date AND r\.end_date >= @date AND r\.result <> 'fail'/);
	assert.match(q.text, /e\.progress_status <> 'dropped'/);
	assert.doesNotMatch(q.text, /lecturer_assignments/);
	assert.equal(out.date, '2026-10-19');
	assert.equal(out.max_mentor_load, 3);
	assert.equal(out.departments[0].rows[0].id, 'r1');
});

test('getBoard: giảng viên phạm vi assigned chỉ thấy khóa được phân công', async () => {
	await getBoard({ date: '2026-10-19' }, actor('GV1', 'assigned'));
	const q = boardQuery();
	assert.match(q.text, /lecturer_assignments/);
	assert.equal(q.inputs.actor_id, 'GV1');
	assert.equal(q.inputs.department_id, undefined);
});

test('getBoard: không truyền ngày ⇒ hôm nay (giờ VN); ngày sai ⇒ 400', async () => {
	const { todayKeyVN } = require('../../src/utils/vnDate');
	const out = await getBoard({}, actor('QL', 'all'));
	assert.equal(out.date, todayKeyVN());
	await assert.rejects(
		getBoard({ date: '19/10/2026' }, actor('QL', 'all')),
		(e) => e.statusCode === 400,
	);
});
