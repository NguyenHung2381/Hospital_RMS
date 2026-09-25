const { getPool, sql } = require('../config/db');
const { ALL_PERMISSIONS } = require('./catalog');
const userStatusCache = require('../middlewares/userStatusCache');

// Bắt buộc xác thực 2 lớp cho tài khoản quản trị: superuser, hoặc vai trò có
// ít nhất 1 quyền đánh dấu `critical` trong catalog (tạo / sửa người dùng, sửa
// vai trò, phân quyền, cấu hình hệ thống...) — lộ mật khẩu của các tài khoản
// này là mất quyền kiểm soát cả hệ thống.
//
// Chuyển tiếp: lần đầu hệ thống thấy tài khoản thuộc diện bắt buộc mà chưa bật
// 2FA, ghi users.twofa_required_since; trong TWOFA_GRACE_DAYS ngày (mặc định 14)
// chỉ nhắc, quá hạn thì chặn mọi API trừ các API để bật 2FA.
// Tắt hẳn: REQUIRE_2FA_FOR_ADMINS=false.
const CRITICAL_KEYS = new Set(ALL_PERMISSIONS.filter((p) => p.critical).map((p) => p.key));
const SUPERUSER_KEY = 'system:manage';

const enabled = () => process.env.REQUIRE_2FA_FOR_ADMINS !== 'false';
const graceDays = () => {
	const n = Number(process.env.TWOFA_GRACE_DAYS);
	return Number.isFinite(n) && n >= 0 ? n : 14;
};

const requiresTwoFactor = (permissionKeys) => {
	if (!enabled() || !permissionKeys) return false;
	if (permissionKeys.has(SUPERUSER_KEY)) return true;
	for (const key of permissionKeys) if (CRITICAL_KEYS.has(key)) return true;
	return false;
};

// Trạng thái 2FA bắt buộc của 1 tài khoản:
//   { state: null }                              — không thuộc diện / đã bật 2FA
//   { state: 'grace',    deadline: Date }        — phải bật trước deadline
//   { state: 'required', deadline: Date }        — đã quá hạn, bị chặn tới khi bật
// Lần đầu thuộc diện: ghi mốc bắt đầu (nguyên tử, không ghi đè mốc cũ).
const twoFactorState = async ({ userId, totpEnabled, requiredSince }, permissionKeys) => {
	if (totpEnabled || !requiresTwoFactor(permissionKeys)) return { state: null };

	let since = requiredSince ? new Date(requiredSince) : null;
	if (!since) {
		const pool = await getPool();
		const r = await pool
			.request()
			.input('id', sql.VarChar(20), userId).query(`
				UPDATE users SET twofa_required_since = SYSUTCDATETIME()
				WHERE id = @id AND twofa_required_since IS NULL;
				SELECT twofa_required_since FROM users WHERE id = @id;
			`);
		since = new Date(r.recordset[0]?.twofa_required_since ?? Date.now());
		userStatusCache.clear(userId);
	}
	const deadline = new Date(since.getTime() + graceDays() * 24 * 60 * 60 * 1000);
	return { state: Date.now() >= deadline.getTime() ? 'required' : 'grace', deadline };
};

module.exports = { requiresTwoFactor, twoFactorState, CRITICAL_KEYS };
