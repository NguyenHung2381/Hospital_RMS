process.env.LOG_LEVEL = 'silent';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mode = require('../../src/utils/attendanceMode');
const { courseResolver } = require('../../src/modules/attendance/shiftService');

test('Kiểu chấm công: buổi học / ca theo từng kiểu, thiếu = cả hai', () => {
	assert.deepEqual(mode.MODES, ['session', 'shift', 'both', 'none']);
	assert.equal(mode.usesSessions('session'), true);
	assert.equal(mode.usesSessions('both'), true);
	assert.equal(mode.usesSessions('shift'), false);
	assert.equal(mode.usesSessions('none'), false);
	assert.equal(mode.usesShifts('shift'), true);
	assert.equal(mode.usesShifts('both'), true);
	assert.equal(mode.usesShifts('session'), false);
	assert.equal(mode.usesShifts('none'), false);
	// Khóa cũ chưa cấu hình ⇒ như trước (cả hai)
	assert.equal(mode.usesSessions(null), true);
	assert.equal(mode.usesShifts(undefined), true);
	assert.deepEqual(mode.ATTENDING_MODES, ['session', 'shift', 'both']);
});

test('SQL kiểu chấm công: khóa ⇒ loại hình ⇒ mặc định; mẫu ca: khóa ⇒ loại hình', () => {
	assert.equal(
		mode.courseModeSql('c'),
		"COALESCE(c.attendance_mode, (SELECT tt.attendance_mode FROM training_types tt WHERE tt.id = c.training_type_id), 'both')",
	);
	assert.equal(
		mode.coursePatternSql('k'),
		'COALESCE(k.shift_pattern_id, (SELECT tt.shift_pattern_id FROM training_types tt WHERE tt.id = k.training_type_id))',
	);
	assert.match(mode.modeInSql('c', mode.SHIFT_MODES), / IN \('shift', 'both'\)$/);
});

const patterns = [
	{ id: 1, name: 'Mặc định', is_default: true, days: {} },
	{ id: 2, name: 'Hành chính', is_default: false, days: {} },
];
const period = (extra) => ({
	course_id: 'KH1',
	course_name: 'Khóa 1',
	start_date: '2027-01-01',
	end_date: '2027-01-31',
	...extra,
});

test('courseResolver: mẫu của khóa / loại hình (đã gộp sẵn) ⇒ mẫu đó, không có ⇒ mẫu mặc định', () => {
	const on = courseResolver([period({ attendance_mode: 'shift', shift_pattern_id: 2 })], patterns);
	assert.equal(on('2027-01-10').pattern.id, 2);
	const dflt = courseResolver([period({ attendance_mode: 'both', shift_pattern_id: null })], patterns);
	assert.equal(dflt('2027-01-10').pattern.id, 1);
	assert.equal(dflt('2027-02-10'), null, 'ngoài thời gian khóa học');
});

test('courseResolver: khóa chỉ chấm theo buổi học ⇒ không có ca (vẫn biết khóa để xin phép)', () => {
	const on = courseResolver([period({ attendance_mode: 'session', shift_pattern_id: 2 })], patterns);
	const c = on('2027-01-10');
	assert.equal(c.course_id, 'KH1');
	assert.equal(c.attendance_mode, 'session');
	assert.equal(c.pattern, null);
});
