// Ghép lượt chấm vân tay vào điểm danh hội nghị (attendanceDevices/seminarPunchMatcher) với
// CSDL giả: chọn hội nghị theo ngày / giờ, PIN = mã nhân viên hoặc mã học viên, chỉ máy dành cho
// hội nghị, phương thức tắt thì không ghép, giữ lần chấm sớm nhất, không đè QR / quét vé.
require('../../scripts/lib/static-check-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

require('../../src/modules/events/eventService').broadcast = () => {};

const S = {};
const log = install(async (text) => {
	if (text.includes('FROM seminar_participants p') && text.includes('JOIN seminars s'))
		return S.cands;
	if (text.includes('UPDATE seminar_participants')) return S.updated ? [{ id: 'P1' }] : [];
	return [];
});
require('../../src/modules/settings/systemSettingService').getValue = async (k) => S.settings[k];
require('../../src/modules/attendanceDevices/deviceSettings').getDeviceSettings = async () => ({
	earlyMin: 30,
	lateAfterMin: 15,
});

const m = require('../../src/modules/attendanceDevices/seminarPunchMatcher');

// 08:05 giờ VN ngày 2027-03-10
const AT = new Date('2027-03-10T01:05:00Z');
const seminar = (over = {}) => ({
	participant_id: 'P1',
	seminar_id: 'HT1',
	event_type: 'conference',
	start_date: new Date('2027-03-10T00:00:00Z'),
	end_date: null,
	start_time: '08:00',
	end_time: '11:30',
	checked_in_at: null,
	...over,
});
const reset = (over = {}) => {
	Object.assign(S, { cands: [seminar()], updated: true, settings: {}, ...over });
	log.length = 0;
};
const punch = (over = {}) => ({
	id: 1,
	pin: '123',
	punched_at: AT,
	serial_no: 'SN1',
	purpose: 'seminar',
	seminar_id: null,
	...over,
});
const writes = () => log.filter((l) => /^\s*UPDATE/.test(l.text));

test('pickSeminar: trong ngày, không sớm hơn giờ bắt đầu − sớm, không quá giờ kết thúc', () => {
	const opt = { earlyMin: 30 };
	const c = [seminar()];
	assert.equal(m.pickSeminar(c, '2027-03-10', 7 * 60 + 30, opt)?.seminar_id, 'HT1');
	assert.equal(m.pickSeminar(c, '2027-03-10', 7 * 60 + 29, opt), null, 'sớm quá');
	assert.equal(m.pickSeminar(c, '2027-03-10', 11 * 60 + 31, opt), null, 'sau giờ kết thúc');
	assert.equal(m.pickSeminar(c, '2027-03-11', 9 * 60, opt), null, 'khác ngày');
	// Nhiều ngày: ngày giữa không xét giờ
	const multi = [seminar({ end_date: new Date('2027-03-12T00:00:00Z') })];
	assert.ok(m.pickSeminar(multi, '2027-03-11', 5 * 60, opt));
	assert.equal(
		m.pickSeminar(multi, '2027-03-12', 12 * 60, opt),
		null,
		'ngày cuối quá giờ kết thúc',
	);
	// Không ghi giờ ⇒ cả ngày
	assert.ok(
		m.pickSeminar([seminar({ start_time: null, end_time: null })], '2027-03-10', 23 * 60, opt),
	);
});

test('pickSeminar: ưu tiên người chưa điểm danh, rồi hội nghị bắt đầu gần giờ chấm nhất', () => {
	const opt = { earlyMin: 30 };
	const c = [
		seminar({ seminar_id: 'A', start_time: '07:00' }),
		seminar({ seminar_id: 'B', start_time: '13:00', end_time: null }),
		seminar({ seminar_id: 'C', start_time: '13:30', end_time: null, checked_in_at: new Date() }),
	];
	assert.equal(m.pickSeminar(c, '2027-03-10', 13 * 60 + 20, opt).seminar_id, 'B');
	assert.equal(m.pickSeminar(c.slice(2), '2027-03-10', 13 * 60 + 20, opt).seminar_id, 'C');
});

test('staffNumberFromPin: chỉ số nguyên dương', () => {
	assert.equal(m.staffNumberFromPin('00123'), 123);
	assert.equal(m.staffNumberFromPin('0'), null);
	assert.equal(m.staffNumberFromPin('NV01'), null);
});

test('matchSeminarPunches: ghép người tham dự, ghi giờ chấm + method device, đánh dấu lượt chấm', async () => {
	reset();
	assert.equal(await m.matchSeminarPunches([punch()]), 1);
	const q = log.find((l) => l.text.includes('JOIN seminars s'));
	assert.equal(q.inputs.sn, 123);
	assert.equal(q.inputs.tid, undefined, 'PIN 3 số không phải mã học viên');
	const [p, ap] = writes();
	assert.match(p.text, /checkin_method = 'device'/);
	assert.match(
		p.text,
		/checked_in_at IS NULL OR \(checkin_method = 'device' AND checked_in_at > @at\)/,
	);
	assert.equal(p.inputs.at, AT);
	assert.equal(p.inputs.tag, 'zk:SN1');
	assert.match(ap.text, /UPDATE attendance_punches SET seminar_id/);
	assert.deepEqual([ap.inputs.sid, ap.inputs.pid], ['HT1', 'P1']);
});

test('matchSeminarPunches: PIN học viên 8 số ⇒ tra cả mã học viên lẫn mã nhân viên', async () => {
	reset();
	await m.matchSeminarPunches([punch({ pin: '00000042' })]);
	const q = log.find((l) => l.text.includes('JOIN seminars s'));
	assert.equal(q.inputs.tid, 'HV00000042');
	assert.equal(q.inputs.sn, 42);
});

test('matchSeminarPunches: máy chỉ dành cho đào tạo / lượt đã ghép ⇒ bỏ qua, không truy vấn', async () => {
	reset();
	assert.equal(
		await m.matchSeminarPunches([punch({ purpose: 'training' }), punch({ seminar_id: 'HT9' })]),
		0,
	);
	assert.equal(log.length, 0);
});

test('matchSeminarPunches: phương thức máy chấm công tắt (hệ thống / loại hội nghị) ⇒ không ghép', async () => {
	reset({ settings: { SEMINAR_CHECKIN_DEVICE: 'false' } });
	assert.equal(await m.matchSeminarPunches([punch()]), 0);
	assert.equal(writes().length, 0);
	reset({
		settings: { SEMINAR_CHECKIN_BY_TYPE: JSON.stringify({ conference: ['qr', 'ticket'] }) },
	});
	assert.equal(await m.matchSeminarPunches([punch()]), 0);
	reset({ settings: { SEMINAR_CHECKIN_BY_TYPE: JSON.stringify({ training: ['qr'] }) } });
	assert.equal(await m.matchSeminarPunches([punch()]), 1, 'loại khác bị giới hạn không ảnh hưởng');
});

test('matchSeminarPunches: không khớp người / giờ ⇒ không ghi gì', async () => {
	reset({ cands: [] });
	assert.equal(await m.matchSeminarPunches([punch()]), 0);
	reset();
	assert.equal(
		await m.matchSeminarPunches([punch({ punched_at: new Date('2027-03-10T06:00:00Z') })]),
		0,
	);
	assert.equal(writes().length, 0);
});
