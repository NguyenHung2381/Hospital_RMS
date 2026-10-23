// Giới hạn đơn xin phép của học viên (utils/leavePolicy.js): đọc từ Cấu hình hệ thống,
// thiếu / sai thì dùng mặc định; kiểm tra giá trị khi admin lưu.
const test = require('node:test');
const assert = require('node:assert/strict');

const settings = {};
require('../../src/modules/settings/systemSettingService').getValue = async (key) => settings[key];
const { getPolicy, publicPolicy, validateSetting } = require('../../src/utils/leavePolicy');

const reset = () => {
	for (const k of Object.keys(settings)) delete settings[k];
};

test('chưa cấu hình → mặc định (bật, nộp bù 3 ngày, xin trước 90 ngày, tối đa 31 ngày/đơn)', async () => {
	reset();
	assert.deepEqual(await getPolicy(), {
		enabled: true,
		backdateDays: 3,
		aheadDays: 90,
		maxSpanDays: 31,
	});
});

test('đọc giá trị đã cấu hình; 0 ngày nộp bù là hợp lệ', async () => {
	reset();
	Object.assign(settings, {
		LEAVE_REQUEST_ENABLED: 'false',
		LEAVE_BACKDATE_DAYS: '0',
		LEAVE_AHEAD_DAYS: '30',
		LEAVE_MAX_SPAN_DAYS: '7',
	});
	const p = await getPolicy();
	assert.deepEqual(p, { enabled: false, backdateDays: 0, aheadDays: 30, maxSpanDays: 7 });
	assert.deepEqual(publicPolicy(p), {
		enabled: false,
		backdate_days: 0,
		ahead_days: 30,
		max_span_days: 7,
	});
});

test('giá trị sai trong DB → dùng mặc định thay vì chặn hết', async () => {
	reset();
	Object.assign(settings, { LEAVE_AHEAD_DAYS: 'abc', LEAVE_MAX_SPAN_DAYS: '0' });
	const p = await getPolicy();
	assert.equal(p.aheadDays, 90);
	assert.equal(p.maxSpanDays, 31);
});

test('kiểm tra khi admin lưu', () => {
	assert.equal(validateSetting('LEAVE_BACKDATE_DAYS', '0'), null);
	assert.equal(validateSetting('LEAVE_AHEAD_DAYS', ''), null);
	assert.match(validateSetting('LEAVE_AHEAD_DAYS', '0') ?? '', /1–365/);
	assert.match(validateSetting('LEAVE_MAX_SPAN_DAYS', '2.5') ?? '', /số nguyên/);
	assert.match(validateSetting('LEAVE_REQUEST_ENABLED', 'yes') ?? '', /true\/false/);
	assert.equal(validateSetting('ATTENDANCE_RADIUS_M', 'x'), null); // không phải key của module này
});
