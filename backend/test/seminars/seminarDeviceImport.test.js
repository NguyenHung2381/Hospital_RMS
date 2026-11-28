// Lấy danh sách người tham dự hội nghị (nội viện) từ lượt chấm máy chấm công
// (seminars/seminarDeviceImportService) với CSDL giả: khoảng giờ mặc định, phân loại mới / đã có /
// không khớp, xem trước không ghi, xác nhận chỉ thêm người được chọn, phương thức tắt thì chặn.
require('../../scripts/lib/static-check-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

require('../../src/modules/events/eventService').broadcast = () => {};

const S = {};
const log = install(async (text, inputs) => {
	if (text.includes('FROM seminars WHERE id = @id')) return S.seminar ? [S.seminar] : [];
	if (text.includes('FROM attendance_devices') && text.includes("purpose IN ('seminar', 'both')"))
		return S.devices;
	if (text.includes('GROUP BY p.pin')) return S.groups;
	if (text.includes('u.staff_number IN')) {
		const want = JSON.parse(inputs.sns).map(Number);
		return S.staff.filter((u) => want.includes(u.staff_number));
	}
	if (text.includes('FROM seminar_participants WHERE seminar_id = @sid')) return S.participants;
	if (text.includes('FROM attendance_device_people')) {
		const want = JSON.parse(inputs.pins);
		return S.deviceNames.filter((x) => want.includes(x.pin));
	}
	if (/INSERT INTO seminar_participants/.test(text)) {
		S.participants.push({ id: inputs.id, user_id: inputs.user_id, staff_number: inputs.staff_number });
		return [{ id: inputs.id }]; // rowsAffected = 1
	}
	if (/UPDATE seminar_participants/.test(text)) return [{ id: inputs.pid }];
	if (/UPDATE attendance_punches/.test(text)) return JSON.parse(inputs.ids).map((id) => ({ id }));
	return [];
});
require('../../src/modules/settings/systemSettingService').getValue = async (k) => S.settings[k];
require('../../src/modules/attendanceDevices/deviceSettings').getDeviceSettings = async () => ({
	earlyMin: 30,
});
require('../../src/modules/persons/personService').syncPersons = async () => {};
// bindInsert dùng sql.Request(tx) — fakeDb thay sẵn; withTransaction chạy thẳng
const svc = require('../../src/modules/seminars/seminarDeviceImportService');

const at = (s) => new Date(`${s}:00+07:00`);
const reset = (over = {}) => {
	Object.assign(S, {
		seminar: {
			id: 'HT1',
			title: 'Hội nghị',
			event_type: 'conference',
			scope: 'hosted',
			start_date: new Date('2027-03-10T00:00:00Z'),
			end_date: null,
			start_time: '08:00',
			end_time: '11:30',
			grants_cme: true,
			cme_default_credits: 4,
		},
		devices: [{ id: 1, name: 'Máy hội trường', serial_no: 'SN1', purpose: 'seminar' }],
		groups: [
			{ pin: '123', first_at: at('2027-03-10T07:50'), last_at: at('2027-03-10T11:20'), punches: 2, ids: [1, 5], first_serial: 'SN1' },
			// Driver có thể trả jsonb_agg dạng chuỗi JSON
			{ pin: '456', first_at: at('2027-03-10T08:10'), last_at: at('2027-03-10T08:10'), punches: 1, ids: '[2]', first_serial: 'SN1' },
			{ pin: '00000042', first_at: at('2027-03-10T08:12'), last_at: at('2027-03-10T08:12'), punches: 1, ids: [3], first_serial: 'SN1' },
			{ pin: '789', first_at: at('2027-03-10T08:15'), last_at: at('2027-03-10T08:15'), punches: 1, ids: [4], first_serial: 'SN1' },
		],
		staff: [
			{ id: 'NV1', full_name: 'Nguyễn A', staff_number: 123, department_name: 'Khoa Nội' },
			{ id: 'NV2', full_name: 'Trần B', staff_number: 456, department_name: 'Khoa Ngoại' },
		],
		participants: [{ id: 'P2', user_id: 'NV2', staff_number: 456, full_name: 'Trần B', checked_in_at: null }],
		settings: {},
		deviceNames: [{ pin: '789', name: 'Nguyen Van Khach' }],
		...over,
	});
	log.length = 0;
};
const writes = () => log.filter((l) => /^\s*(INSERT|UPDATE)/.test(l.text));

test('defaultWindow: giờ bắt đầu − sớm tới giờ kết thúc; không ghi giờ ⇒ cả ngày; chưa có ngày ⇒ null', () => {
	reset();
	const w = svc.defaultWindow(S.seminar, 30);
	assert.equal(svc.toLocal(w.from), '2027-03-10T07:30');
	assert.equal(svc.toLocal(w.to), '2027-03-10T11:30');
	const d = svc.defaultWindow({ start_date: '2027-03-10', end_date: '2027-03-12' }, 30);
	assert.equal(svc.toLocal(d.from), '2027-03-10T00:00');
	assert.equal(svc.toLocal(d.to), '2027-03-12T23:59');
	assert.equal(svc.defaultWindow({ start_date: null }, 30), null);
});

test('xem trước: mới / đã có / không khớp (mã học viên, mã lạ), không ghi gì', async () => {
	reset();
	const r = await svc.importFromDevice({ seminar_id: 'HT1', dry_run: true }, 'U1');
	assert.equal(r.dry_run, true);
	assert.deepEqual(r.summary, { new: 1, existing: 1, unmatched: 2, punches: 5 });
	assert.deepEqual(
		r.rows.map((x) => [x.pin, x.status]),
		[
			['123', 'new'],
			['456', 'existing'],
			['00000042', 'unmatched'],
			['789', 'unmatched'],
		],
	);
	assert.match(r.rows[2].reason, /Mã học viên/);
	assert.match(r.rows[3].reason, /Không có cán bộ/);
	assert.equal(r.rows[3].device_name, 'Nguyen Van Khach', 'tên khai trên máy cho mã không khớp');
	assert.equal(r.rows[0].device_name, null);
	assert.equal(r.rows[0].ids, undefined, 'không lộ id lượt chấm');
	assert.equal(r.from, '2027-03-10T07:30');
	assert.equal(r.to, '2027-03-10T11:30');
	assert.equal(r.devices[0].selected, true);
	assert.equal(writes().length, 0);
	// Khoảng giờ gửi xuống DB là giờ UTC
	const q = log.find((l) => l.text.includes('GROUP BY p.pin'));
	assert.equal(q.inputs.from, '2027-03-10 00:30:00');
});

test('xác nhận: thêm người mới (nội viện, tín chỉ mặc định), điểm danh cả người đã có, gắn lượt chấm', async () => {
	reset();
	const r = await svc.importFromDevice({ seminar_id: 'HT1' }, 'U1');
	assert.equal(r.inserted, 1);
	const ins = log.filter((l) => /INSERT INTO seminar_participants/.test(l.text));
	assert.equal(ins.length, 1);
	assert.deepEqual(
		[ins[0].inputs.user_id, ins[0].inputs.staff_number, ins[0].inputs.source, ins[0].inputs.participation_type],
		['NV1', 123, 'internal', 'attendee'],
	);
	assert.equal(Number(ins[0].inputs.cme_credits), 4);
	const checks = log.filter((l) => /UPDATE seminar_participants/.test(l.text));
	assert.equal(checks.length, 2, 'người mới + người đã có');
	assert.deepEqual(checks[0].inputs.at, at('2027-03-10T07:50'), 'giờ = lần chấm sớm nhất');
	assert.equal(checks[1].inputs.pid, 'P2');
	assert.equal(r.checked_in, 2);
	assert.equal(r.linked_punches, 3);
});

test('xác nhận: chỉ thêm mã được chọn', async () => {
	reset();
	const r = await svc.importFromDevice({ seminar_id: 'HT1', pins: ['999'] }, 'U1');
	assert.equal(r.inserted, 0);
	assert.equal(log.filter((l) => /INSERT INTO seminar_participants/.test(l.text)).length, 0);
	assert.equal(r.checked_in, 1, 'người đã có vẫn được ghi điểm danh');
});

test('phương thức máy chấm công tắt: xem trước được (cảnh báo), xác nhận bị chặn', async () => {
	reset({ settings: { SEMINAR_CHECKIN_DEVICE: 'false' } });
	const r = await svc.importFromDevice({ seminar_id: 'HT1', dry_run: true }, 'U1');
	assert.equal(r.method_enabled, false);
	assert.ok(r.warnings.some((w) => /đang tắt/.test(w)));
	await assert.rejects(svc.importFromDevice({ seminar_id: 'HT1' }, 'U1'), { statusCode: 409 });
	assert.equal(writes().length, 0);
});

test('khoảng giờ: hội nghị chưa có ngày phải chọn; sai thứ tự / quá dài ⇒ 400', async () => {
	reset({ seminar: { id: 'HT1', event_type: 'conference', start_date: null } });
	await assert.rejects(svc.importFromDevice({ seminar_id: 'HT1', dry_run: true }, 'U1'), {
		statusCode: 400,
	});
	reset();
	for (const [from, to] of [
		['2027-03-10T10:00', '2027-03-10T09:00'],
		['2027-01-01T00:00', '2027-03-10T00:00'],
		['hôm nay', '2027-03-10T09:00'],
	])
		await assert.rejects(svc.importFromDevice({ seminar_id: 'HT1', dry_run: true, from, to }, 'U1'), {
			statusCode: 400,
		});
	reset({ seminar: null });
	await assert.rejects(svc.importFromDevice({ seminar_id: 'X', dry_run: true }, 'U1'), { statusCode: 404 });
});
