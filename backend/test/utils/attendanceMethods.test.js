// Phương thức điểm danh được phép (utils/attendanceMethods): 2 tầng hệ thống × loại hình,
// chuẩn hoá giá trị lưu cột loại hình, kiểm cấu hình theo loại hội nghị.
require('../../scripts/lib/static-check-env');
const test = require('node:test');
const assert = require('node:assert/strict');

const settings = {};
require('../../src/modules/settings/systemSettingService').getValue = async (k) => settings[k];
const m = require('../../src/utils/attendanceMethods');

const reset = (over = {}) => {
	for (const k of Object.keys(settings)) delete settings[k];
	Object.assign(settings, over);
};

test('parseList / toColumn: chuẩn hoá, bỏ giá trị lạ, chọn đủ = NULL (theo hệ thống)', () => {
	assert.equal(m.parseList(null), null);
	assert.deepEqual(m.parseList('device, qr,lạ'), ['qr', 'device']);
	assert.deepEqual(m.parseList(''), []);
	assert.equal(m.toColumn(null), null);
	assert.equal(m.toColumn(['device', 'qr']), 'qr,device');
	assert.equal(m.toColumn([]), '');
	assert.equal(m.toColumn(['qr', 'app', 'device']), null);
	assert.equal(m.toColumn('app,qr,device'), null);
});

test('invalidList: báo phương thức lạ, nhận null / mảng rỗng / chuỗi hợp lệ', () => {
	assert.equal(m.invalidList(null), null);
	assert.equal(m.invalidList([]), null);
	assert.equal(m.invalidList('qr,device'), null);
	assert.match(m.invalidList(['qr', 'manual']), /manual/);
});

test('forTypeValue: dùng được khi bật ở cả hệ thống lẫn loại hình; tay luôn được', () => {
	const all = { qr: true, app: true, device: true };
	assert.deepEqual(m.forTypeValue(all, null), { qr: true, app: true, device: true, manual: true });
	assert.deepEqual(m.forTypeValue(all, 'device'), {
		qr: false,
		app: false,
		device: true,
		manual: true,
	});
	assert.deepEqual(m.forTypeValue({ ...all, device: false }, 'device'), {
		qr: false,
		app: false,
		device: false,
		manual: true,
	});
	assert.deepEqual(m.forTypeValue(all, ''), { qr: false, app: false, device: false, manual: true });
});

test('systemTraining: mặc định bật, chỉ đúng "false" là tắt', async () => {
	reset();
	assert.deepEqual(await m.systemTraining(), { qr: true, app: true, device: true });
	reset({ ATTENDANCE_METHOD_APP: 'false', ATTENDANCE_METHOD_QR: 'true' });
	assert.deepEqual(await m.systemTraining(), { qr: true, app: false, device: true });
});

test('forSeminarType: loại không có trong cấu hình = tất cả; công tắc hệ thống thắng', async () => {
	reset({ SEMINAR_CHECKIN_BY_TYPE: JSON.stringify({ conference: ['ticket'], other: [] }) });
	const pick = ({ qr, ticket }) => ({ qr, ticket });
	assert.deepEqual(pick(await m.forSeminarType('conference')), { qr: false, ticket: true });
	assert.deepEqual(pick(await m.forSeminarType('other')), { qr: false, ticket: false });
	assert.deepEqual(pick(await m.forSeminarType('training')), { qr: true, ticket: true });
	reset({ SEMINAR_CHECKIN_TICKET: 'false', SEMINAR_CHECKIN_BY_TYPE: 'hỏng' });
	assert.deepEqual(pick(await m.forSeminarType('conference')), { qr: true, ticket: false });
	assert.deepEqual(m.publicSeminar(await m.forSeminarType('x')), {
		qr: true,
		ticket: false,
		device: true,
		manual: true,
	});
	reset({ SEMINAR_CHECKIN_DEVICE: 'false', SEMINAR_CHECKIN_BY_TYPE: '{"other":["device"]}' });
	assert.equal((await m.forSeminarType('other')).device, false, 'công tắc hệ thống thắng');
	reset({ SEMINAR_CHECKIN_BY_TYPE: '{"other":["device"]}' });
	assert.deepEqual(pick(await m.forSeminarType('other')), { qr: false, ticket: false });
	assert.equal((await m.forSeminarType('other')).device, true);
});

test('validateSetting SEMINAR_CHECKIN_BY_TYPE: JSON object { loại: [qr|ticket|device] }', () => {
	const v = (x) => m.validateSetting('SEMINAR_CHECKIN_BY_TYPE', x);
	assert.equal(v(''), null);
	assert.equal(v('{"conference":["qr"],"other":[]}'), null);
	assert.match(v('[]'), /object/);
	assert.match(v('{'), /JSON/);
	assert.equal(v('{"conference":["device"]}'), null);
	assert.match(v('{"conference":["fingerprint"]}'), /qr\/ticket\/device/);
	assert.match(v('{"Hội nghị":["qr"]}'), /Loại hội nghị/);
	assert.equal(
		m.validateSetting('ATTENDANCE_METHOD_QR', 'xyz'),
		null,
		'khóa khác không thuộc module',
	);
});

test('courseAllowsSql: NULL ⇒ cho phép, chặn phương thức lạ', () => {
	assert.match(m.courseAllowsSql('c', 'device'), /COALESCE\('device' = ANY\(string_to_array/);
	assert.match(m.courseAllowsSql('c', 'device'), /, true\)$/);
	assert.throws(() => m.courseAllowsSql('c', "x' OR 1=1 --"));
});
