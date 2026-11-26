process.env.LOG_LEVEL = 'silent';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pickSession, vnParts } = require('../../src/modules/attendanceDevices/punchMatcher');
const { planDeviceSync } = require('../../src/modules/attendanceDevices/deviceSyncService');

const S = { earlyMin: 30, lateAfterMin: 15 };
const at = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const sessions = [
	{ session_id: 'BH1', start_time: '07:30', end_time: '11:30' },
	{ session_id: 'BH2', start_time: '13:30', end_time: '16:30' },
];

test('vnParts: UTC → ngày + phút giờ VN', () => {
	assert.deepEqual(vnParts(new Date('2027-01-04T17:10:00Z')), { date: '2027-01-05', minute: 10 });
});

test('pickSession: sớm / đúng giờ / muộn / ngoài khung', () => {
	assert.deepEqual(pickSession(sessions, at('07:00'), S), { sessionId: 'BH1', status: 'present' });
	assert.equal(pickSession(sessions, at('06:59'), S), null);
	assert.deepEqual(pickSession(sessions, at('07:45'), S), { sessionId: 'BH1', status: 'present' });
	assert.deepEqual(pickSession(sessions, at('07:46'), S), { sessionId: 'BH1', status: 'late' });
	assert.deepEqual(pickSession(sessions, at('11:30'), S), { sessionId: 'BH1', status: 'late' });
	assert.equal(pickSession(sessions, at('12:00'), S), null);
	assert.deepEqual(pickSession(sessions, at('13:10'), S), { sessionId: 'BH2', status: 'present' });
});

test('pickSession: 2 buổi liền nhau ⇒ buổi có giờ bắt đầu gần nhất', () => {
	const back = [
		{ session_id: 'A', start_time: '07:30', end_time: '09:30' },
		{ session_id: 'B', start_time: '09:30', end_time: '11:30' },
	];
	assert.equal(pickSession(back, at('09:20'), S).sessionId, 'B');
	assert.equal(pickSession(back, at('08:00'), S).sessionId, 'A');
});

test('pickSession: thiếu giờ kết thúc ⇒ 4 tiếng; thiếu giờ bắt đầu ⇒ bỏ', () => {
	assert.equal(
		pickSession([{ session_id: 'X', start_time: '08:00', end_time: null }], at('11:59'), S)
			.sessionId,
		'X',
	);
	assert.equal(
		pickSession([{ session_id: 'X', start_time: null, end_time: null }], at('08:00'), S),
		null,
	);
});

const device = { id: 1, name_ascii: false, push_version: '2.4.1', fp_algorithm: '10' };
const base = { device, fingerMeta: new Map(), busy: new Set(), fpSync: true };

test('planDeviceSync: thêm mới, đổi tên, giữ nguyên, xóa', () => {
	const plan = planDeviceSync({
		...base,
		desired: [
			{ trainee_id: 'HV20270001', full_name: 'Nguyễn Văn A' },
			{ trainee_id: 'HV20270002', full_name: 'Trần Thị B' },
			{ trainee_id: 'HV20270003', full_name: 'Lê C' },
			{ trainee_id: 'HVXX', full_name: 'Mã sai' },
		],
		current: [
			{ trainee_id: 'HV20270002', pin: '20270002', name_sent: 'Trần Thị B', fp_hashes: null },
			{ trainee_id: 'HV20270003', pin: '20270003', name_sent: 'Le C', fp_hashes: null },
			{ trainee_id: 'HV20260009', pin: '20260009', name_sent: 'Hết khóa', fp_hashes: null },
		],
	});
	assert.deepEqual(
		plan.map((x) => `${x.kind}:${x.traineeId}`),
		['user_upsert:HV20270001', 'user_upsert:HV20270003', 'user_delete:HV20260009'],
	);
});

test('planDeviceSync: vân tay — thiếu thì gửi, đã có / khác thuật toán / đang chờ thì bỏ', () => {
	const fingerMeta = new Map([
		[
			'HV20270001',
			[
				{ fingerIndex: 6, hash: 'h6', algo: '10' },
				{ fingerIndex: 7, hash: 'h7', algo: '10' },
				{ fingerIndex: 8, hash: 'h8', algo: '12' },
				{ fingerIndex: 9, hash: 'h9', algo: null },
			],
		],
	]);
	const plan = planDeviceSync({
		...base,
		fingerMeta,
		busy: new Set(['fp_upsert:HV20270001:9']),
		desired: [{ trainee_id: 'HV20270001', full_name: 'A' }],
		current: [
			{ trainee_id: 'HV20270001', pin: '20270001', name_sent: 'A', fp_hashes: '{"6":"h6"}' },
		],
	});
	assert.deepEqual(plan, [
		{ kind: 'fp_upsert', traineeId: 'HV20270001', pin: '20270001', fingerIndex: 7 },
	]);
	assert.deepEqual(
		planDeviceSync({
			...base,
			fingerMeta,
			fpSync: false,
			desired: [{ trainee_id: 'HV20270001', full_name: 'A' }],
			current: [{ trainee_id: 'HV20270001', pin: '20270001', name_sent: 'A' }],
		}),
		[],
	);
});

test('planDeviceSync: lệnh đang chờ thì không xếp trùng; tên không dấu', () => {
	const plan = planDeviceSync({
		...base,
		device: { ...device, name_ascii: true },
		busy: new Set(['user_upsert:HV20270001']),
		desired: [
			{ trainee_id: 'HV20270001', full_name: 'Nguyễn Văn A' },
			{ trainee_id: 'HV20270002', full_name: 'Đỗ Thị B' },
		],
		current: [],
	});
	assert.deepEqual(plan, [
		{ kind: 'user_upsert', traineeId: 'HV20270002', pin: '20270002', name: 'Do Thi B' },
	]);
});
