const systemSettingService = require('../modules/settings/systemSettingService');

// Đơn xin phép của học viên (modules/attendance/leaveRequestService.js). Admin chỉnh
// ở Cấu hình hệ thống → tab "Điểm danh" → nhóm "Đơn xin phép". Chưa cấu hình = mặc định.
//   LEAVE_REQUEST_ENABLED  'false' = học viên không gửi được đơn mới (đơn cũ vẫn duyệt được)
//   LEAVE_BACKDATE_DAYS    được nộp bổ sung cho ngày đã qua tối đa N ngày (0 = không cho)
//   LEAVE_AHEAD_DAYS       được xin phép trước tối đa N ngày
//   LEAVE_MAX_SPAN_DAYS    một đơn xin nghỉ dài tối đa N ngày
const LIMITS = {
	LEAVE_BACKDATE_DAYS: { min: 0, max: 30, def: 3, label: 'Số ngày nộp bổ sung' },
	LEAVE_AHEAD_DAYS: { min: 1, max: 365, def: 90, label: 'Số ngày xin trước' },
	LEAVE_MAX_SPAN_DAYS: { min: 1, max: 180, def: 31, label: 'Số ngày tối đa / đơn' },
};

const intIn = (raw, { min, max }) => {
	if (raw === null || raw === undefined || raw === '') return null;
	const n = Number(raw);
	return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

// null = hợp lệ; ngược lại là thông báo lỗi (dùng khi admin lưu cấu hình)
const validateSetting = (key, value) => {
	if (value === null || value === '') return null;
	if (key === 'LEAVE_REQUEST_ENABLED')
		return value === 'true' || value === 'false' ? null : 'Giá trị phải là true/false';
	const limit = LIMITS[key];
	if (!limit) return null;
	return intIn(value, limit) === null
		? `${limit.label} phải là số nguyên ${limit.min}–${limit.max}`
		: null;
};

/** @returns {Promise<{ enabled: boolean, backdateDays: number, aheadDays: number, maxSpanDays: number }>} */
const getPolicy = async () => {
	const [enabled, backdate, ahead, span] = await Promise.all(
		['LEAVE_REQUEST_ENABLED', ...Object.keys(LIMITS)].map((k) => systemSettingService.getValue(k)),
	);
	return {
		enabled: enabled !== 'false',
		backdateDays: intIn(backdate, LIMITS.LEAVE_BACKDATE_DAYS) ?? LIMITS.LEAVE_BACKDATE_DAYS.def,
		aheadDays: intIn(ahead, LIMITS.LEAVE_AHEAD_DAYS) ?? LIMITS.LEAVE_AHEAD_DAYS.def,
		maxSpanDays: intIn(span, LIMITS.LEAVE_MAX_SPAN_DAYS) ?? LIMITS.LEAVE_MAX_SPAN_DAYS.def,
	};
};

// Dạng gửi về client (trang Điểm danh của học viên)
const publicPolicy = (p) => ({
	enabled: p.enabled,
	backdate_days: p.backdateDays,
	ahead_days: p.aheadDays,
	max_span_days: p.maxSpanDays,
});

module.exports = { getPolicy, publicPolicy, validateSetting, LIMITS };
