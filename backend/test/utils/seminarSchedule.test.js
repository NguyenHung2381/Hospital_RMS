const test = require('node:test');
const assert = require('node:assert');
const s = require('../../src/utils/seminarSchedule');

// Giờ VN (UTC+7) → mốc thời gian
const vn = (iso) => new Date(`${iso}+07:00`).getTime();
// DATE từ mssql: 00:00 UTC
const dbDate = (key) => new Date(`${key}T00:00:00Z`);

test('normalizeTime: chuẩn HH:mm, rỗng → null, sai → 400', () => {
	assert.strictEqual(s.normalizeTime(undefined, 'x'), undefined);
	assert.strictEqual(s.normalizeTime('', 'x'), null);
	assert.strictEqual(s.normalizeTime(null, 'x'), null);
	assert.strictEqual(s.normalizeTime('08:30', 'x'), '08:30');
	assert.strictEqual(s.normalizeTime('08:30:00', 'x'), '08:30');
	assert.throws(
		() => s.normalizeTime('8h', 'Giờ bắt đầu'),
		(e) => e.statusCode === 400 && /Giờ bắt đầu/.test(e.message),
	);
	assert.throws(
		() => s.normalizeTime('24:00', 'x'),
		(e) => e.statusCode === 400,
	);
});

test('testState: chưa bật = off; không có khung giờ = open khi bật', () => {
	assert.strictEqual(s.testState({ test_open: false }), 'off');
	assert.strictEqual(s.testState({ test_open: true }), 'open');
});

test('testState: khung giờ theo giờ VN, mặc định ngày kết thúc hội nghị', () => {
	const sem = {
		test_open: true,
		start_date: dbDate('2026-10-15'),
		end_date: dbDate('2026-10-16'),
		test_start_time: '16:00',
		test_end_time: '16:30',
	};
	assert.strictEqual(s.testState(sem, vn('2026-10-16T15:59:00')), 'scheduled');
	assert.strictEqual(s.testState(sem, vn('2026-10-16T16:00:00')), 'open');
	assert.strictEqual(s.testState(sem, vn('2026-10-16T16:30:00')), 'open');
	assert.strictEqual(s.testState(sem, vn('2026-10-16T16:31:00')), 'closed');
	// Ngày làm bài riêng
	const sem2 = { ...sem, test_date: dbDate('2026-10-15') };
	assert.strictEqual(s.testState(sem2, vn('2026-10-15T16:10:00')), 'open');
	assert.strictEqual(s.testState(sem2, vn('2026-10-16T16:10:00')), 'closed');
	assert.strictEqual(s.testWindow(sem2).date, '2026-10-15');
	// Tắt công tắc thì dù trong khung giờ vẫn đóng
	assert.strictEqual(s.testState({ ...sem, test_open: false }, vn('2026-10-16T16:10:00')), 'off');
});

test('testState: chỉ có giờ mở → mở từ giờ đó, không tự đóng', () => {
	const sem = { test_open: true, start_date: '2026-10-15', test_start_time: '09:00' };
	assert.strictEqual(s.testState(sem, vn('2026-10-15T08:00:00')), 'scheduled');
	assert.strictEqual(s.testState(sem, vn('2026-10-20T08:00:00')), 'open');
});

test('normalizeAgenda: bỏ trường trống, kiểm tra tên + giờ', () => {
	assert.strictEqual(s.normalizeAgenda(null), null);
	assert.strictEqual(s.normalizeAgenda([]), null);
	const json = s.normalizeAgenda([
		{
			title: '  Khai mạc ',
			start_time: '08:00',
			end_time: '08:30',
			speaker: '',
			date: '2026-10-15',
		},
	]);
	assert.deepStrictEqual(JSON.parse(json), [
		{ title: 'Khai mạc', date: '2026-10-15', start_time: '08:00', end_time: '08:30' },
	]);
	assert.throws(() => s.normalizeAgenda([{ title: '' }]), /Bài 1: chưa nhập tên bài/);
	assert.throws(
		() => s.normalizeAgenda([{ title: 'A', start_time: '09:00', end_time: '08:00' }]),
		/sau giờ bắt đầu/,
	);
	assert.throws(
		() => s.normalizeAgenda('x'),
		(e) => e.statusCode === 400,
	);
	assert.deepStrictEqual(s.parseAgenda('oops'), []);
});
