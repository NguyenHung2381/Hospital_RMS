const test = require('node:test');
const assert = require('node:assert/strict');
const {
	buildProgress,
	roundStatus,
	paceOf,
} = require('../../src/modules/training/trainees/traineeProgressService');

const TODAY = '2026-06-15';

test('roundStatus: lấy lần học gần nhất của từng khoa', () => {
	assert.equal(roundStatus([], TODAY), 'missing');
	// Không đạt rồi học lại đạt → đạt
	assert.equal(
		roundStatus(
			[
				{ id: 'a', department_id: 'K1', attempt_no: 1, seq: 10, result: 'fail' },
				{ id: 'b', department_id: 'K1', attempt_no: 2, seq: 20, result: 'pass' },
			],
			TODAY,
		),
		'passed',
	);
	// Vòng chia 2 khoa: 1 đạt, 1 đang học → đang học
	assert.equal(
		roundStatus(
			[
				{ id: 'a', department_id: 'K1', attempt_no: 1, seq: 10, result: 'pass' },
				{
					id: 'b',
					department_id: 'K2',
					attempt_no: 1,
					seq: 20,
					result: 'pending',
					start_date: '2026-06-01',
					end_date: '2026-06-30',
				},
			],
			TODAY,
		),
		'in_progress',
	);
	// Hết ngày mà chưa chấm → quá hạn
	assert.equal(
		roundStatus(
			[
				{
					id: 'a',
					attempt_no: 1,
					seq: 10,
					result: 'pending',
					start_date: '2026-05-01',
					end_date: '2026-05-31',
				},
			],
			TODAY,
		),
		'overdue',
	);
	assert.equal(
		roundStatus([{ id: 'a', attempt_no: 1, seq: 10, result: 'pending' }], TODAY),
		'not_scheduled',
	);
});

test('paceOf: so % hoàn thành với % thời gian đã qua', () => {
	const base = {
		progressStatus: 'in_progress',
		start: '2026-01-01',
		end: '2026-12-31',
		today: TODAY,
	};
	assert.equal(paceOf({ ...base, completion: 0.45 }).pace, 'on_track');
	assert.equal(paceOf({ ...base, completion: 0.1 }).pace, 'behind');
	assert.equal(paceOf({ ...base, completion: 0.9 }).pace, 'ahead');
	assert.equal(paceOf({ ...base, today: '2025-12-01', completion: 0 }).pace, 'not_started');
	assert.equal(paceOf({ ...base, today: '2027-01-05', completion: 0.8 }).pace, 'overdue');
	assert.equal(paceOf({ ...base, start: null, completion: 0.5 }).pace, 'unknown');
	assert.equal(paceOf({ ...base, progressStatus: 'completed', completion: 0.5 }).pace, 'completed');
});

test('buildProgress: bài chương trình mới thêm / đã bỏ được tách riêng, không tính vào %', () => {
	const out = buildProgress({
		enrollment: {
			progress_status: 'in_progress',
			practice_start_date: '2026-01-01',
			practice_end_date: '2026-12-31',
		},
		programTheory: [
			{ id: 'L1', title: 'Bài 1', total_hours: 4 },
			{ id: 'L2', title: 'Bài 2', total_hours: 6 },
			{ id: 'L3', title: 'Bài 3 (mới thêm)', total_hours: 2 },
		],
		recordTheory: [
			{
				lesson_id: 'L1',
				title: 'Bài 1',
				status: 'done',
				total_hours: 4,
				completed_at: '2026-02-01',
			},
			{ lesson_id: 'L2', title: 'Bài 2', status: 'in_progress', total_hours: 6 },
			{ lesson_id: 'L9', title: 'Bài đã bỏ', status: 'done', total_hours: 3 },
		],
		programRounds: [
			{ id: 'R1', title: 'Hồi sức', duration_value: 3, duration_unit: 'month' },
			{ id: 'R2', title: 'Nội', duration_value: 1, duration_unit: 'month' },
		],
		recordRotations: [{ id: 'x', lesson_id: 'R1', seq: 10, attempt_no: 1, result: 'pass' }],
		today: TODAY,
	});

	assert.deepEqual(
		out.theory.items.map((i) => [i.lesson_id, i.status, i.in_program]),
		[
			['L1', 'done', true],
			['L2', 'in_progress', true],
			['L3', 'missing', true],
			['L9', 'done', false],
		],
	);
	assert.equal(out.theory.summary.required, 3);
	assert.equal(out.theory.summary.done, 1);
	assert.equal(out.theory.summary.missing, 1);
	assert.equal(out.theory.summary.extra, 1);
	assert.equal(out.theory.summary.hours_required, 12);
	assert.equal(out.theory.summary.hours_done, 4);

	assert.deepEqual(
		out.rotations.items.map((i) => [i.lesson_id, i.status, i.required_duration]),
		[
			['R1', 'passed', '03 tháng'],
			['R2', 'missing', '01 tháng'],
		],
	);
	assert.equal(out.rotations.summary.days_required, 120);
	assert.equal(out.rotations.summary.days_passed, 90);

	// 2 / 5 phần (L1 + R1) = 40%, thời gian đã qua ~46% → đúng tiến độ
	assert.equal(out.summary.required, 5);
	assert.equal(out.summary.done, 2);
	assert.equal(out.summary.completion, 0.4);
	assert.equal(out.summary.pace, 'on_track');
	assert.equal(out.summary.out_of_sync, true);
});

test('buildProgress: không có chương trình → completion null, nhịp không xác định', () => {
	const out = buildProgress({ enrollment: { progress_status: 'in_progress' }, today: TODAY });
	assert.equal(out.summary.completion, null);
	assert.equal(out.summary.pace, 'unknown');
	assert.equal(out.summary.out_of_sync, false);
});
