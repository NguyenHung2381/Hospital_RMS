const systemSettingService = require('../modules/settings/systemSettingService');

// Hạn dùng của mật khẩu tạm — mật khẩu do người khác cấp (tạo tài khoản, quản
// trị đặt lại, cấp tài khoản học viên / thành viên đề tài), sinh ngẫu nhiên
// (utils/passwordPolicy.generateTempPassword); tài khoản cũ có thể còn mật khẩu = tên đăng nhập.
//
// Cờ must_change_password chỉ bắt "người đăng nhập đầu tiên" đổi mật khẩu: tên
// đăng nhập dễ đoán (NVA_0001, chữ cái đầu + mã NV...) nên kẻ gian vào trước
// chủ tài khoản là chiếm luôn. Giới hạn thời gian mật khẩu tạm còn dùng được để
// tài khoản cấp ra mà bỏ quên không bị bỏ ngỏ mãi.
//
//   users.temp_password_issued_at — lúc cấp mật khẩu tạm (UTC). NULL khi người
//     dùng tự đặt mật khẩu (đổi mật khẩu / quên mật khẩu bằng OTP).
//   TEMP_PASSWORD_TTL_DAYS (Cấu hình hệ thống, fallback .env) — số ngày mật
//     khẩu tạm còn dùng được, mặc định 7. 0 = không giới hạn.
//
// Quá hạn mà chưa đổi: không đăng nhập được, phiên đang mở bị chặn. Người dùng
// tự lấy lại bằng "Quên mật khẩu" (nếu có email) hoặc nhờ quản trị đặt lại
// (cấp mật khẩu tạm mới ⇒ tính hạn lại từ đầu).

const SETTING_KEY = 'TEMP_PASSWORD_TTL_DAYS';
const DEFAULT_TTL_DAYS = 7;
const MAX_TTL_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

const EXPIRED_MESSAGE =
	'Mật khẩu tạm đã hết hạn sử dụng. Vui lòng dùng "Quên mật khẩu" hoặc liên hệ quản trị viên để được cấp lại.';

const parseTtlDays = (raw) => {
	if (raw === undefined || raw === null || String(raw).trim() === '') return DEFAULT_TTL_DAYS;
	const n = Number(raw);
	return Number.isInteger(n) && n >= 0 && n <= MAX_TTL_DAYS ? n : DEFAULT_TTL_DAYS;
};

const ttlDays = async () => parseTtlDays(await systemSettingService.getValue(SETTING_KEY));

// Hạn chót của mật khẩu tạm, null = không có hạn (đã tự đổi / không giới hạn).
const deadlineOf = (issuedAt, days) => {
	if (!issuedAt || !days) return null;
	const t = new Date(issuedAt).getTime();
	return Number.isFinite(t) ? new Date(t + days * DAY_MS) : null;
};

// { mustChangePassword, issuedAt } — khớp cả dòng users (must_change_password,
// temp_password_issued_at) lẫn status của userStatusCache.
const isExpired = async ({ mustChangePassword, issuedAt }, now = Date.now()) => {
	if (!mustChangePassword || !issuedAt) return false;
	const deadline = deadlineOf(issuedAt, await ttlDays());
	return !!deadline && now >= deadline.getTime();
};

// Kiểm tra giá trị nhập ở màn Cấu hình hệ thống (systemSettings.routes.js).
const validateSetting = (key, value) => {
	if (key !== SETTING_KEY || value === null || value === undefined || value === '') return null;
	const n = Number(value);
	return Number.isInteger(n) && n >= 0 && n <= MAX_TTL_DAYS
		? null
		: `Hạn dùng mật khẩu tạm phải là số nguyên từ 0 đến ${MAX_TTL_DAYS} ngày (0 = không giới hạn)`;
};

module.exports = {
	SETTING_KEY,
	DEFAULT_TTL_DAYS,
	EXPIRED_MESSAGE,
	parseTtlDays,
	ttlDays,
	deadlineOf,
	isExpired,
	validateSetting,
};
