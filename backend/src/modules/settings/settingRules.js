// Kiểm tra giá trị cấu hình trước khi lưu — gom một chỗ cho cả PUT /:key lẫn PUT / (lưu nhiều).
// Mỗi module đọc cấu hình tự giữ ràng buộc của khóa mình qua validateSetting(key, value)
// (null = hợp lệ, chuỗi = thông báo lỗi; khóa không thuộc module thì trả null).
// Module MỚI có ràng buộc riêng: thêm vào VALIDATORS là xong, route không phải sửa.
//
// Tách khỏi systemSettingService vì các module này đều require service đó (tránh vòng require).
const systemSettingService = require('./systemSettingService');
const uploadPolicy = require('../../utils/uploadPolicy');
const clamav = require('../../utils/clamav');
const attendancePolicy = require('../../utils/attendancePolicy');
const attendanceMethods = require('../../utils/attendanceMethods');
const leavePolicy = require('../../utils/leavePolicy');
const captcha = require('../../utils/captcha');
const tempPasswordPolicy = require('../../permissions/tempPasswordPolicy');
const classDates = require('../../utils/classDates');
const holidaySync = require('./holidaySync');
const tuitionBankSettings = require('../training/tuition/bank/bankSettings');

const VALIDATORS = [
	systemSettingService, // công tắc true/false, danh sách chọn, JSON
	uploadPolicy,
	clamav,
	attendancePolicy,
	attendanceMethods, // SEMINAR_CHECKIN_BY_TYPE
	leavePolicy,
	captcha,
	tempPasswordPolicy,
	classDates, // TRAINING_HOLIDAYS
	holidaySync, // TRAINING_HOLIDAYS_ICS_URL
	tuitionBankSettings, // TUITION_BANK_API_*
];

/** Chuẩn hoá giá trị gửi lên (vd cắt khoảng trắng khóa reCAPTCHA) — chạy TRƯỚC validate. */
const normalize = (key, value) => captcha.normalizeSetting(key, value ?? null);

/** null = hợp lệ; ngược lại là thông báo lỗi của module đầu tiên từ chối. */
const validate = (key, value) => {
	for (const v of VALIDATORS) {
		const msg = v.validateSetting(key, value);
		if (msg) return msg;
	}
	return null;
};

/**
 * Kiểm cả lô { KEY: value } — không dừng ở lỗi đầu tiên để trang cấu hình báo đỏ đủ mọi ô.
 * @returns {{ values: Record<string, string|null>, errors: Record<string, string> }}
 */
const checkMany = (input) => {
	const values = {};
	const errors = {};
	for (const [key, raw] of Object.entries(input)) {
		if (!systemSettingService.isKey(key)) {
			errors[key] = 'Không có cấu hình này';
			continue;
		}
		if (raw !== null && typeof raw !== 'string') {
			errors[key] = 'Giá trị phải là chuỗi';
			continue;
		}
		const value = normalize(key, raw);
		const msg = validate(key, value);
		if (msg) errors[key] = msg;
		else values[key] = value;
	}
	return { values, errors };
};

module.exports = { normalize, validate, checkMany, VALIDATORS };
