const { getPool, sql } = require('../config/db');
const cacheBus = require('../utils/cacheBus');

// Lớp xác thực thứ 2 cho các API cần token: JWT (middlewares/auth.js) chỉ xác
// minh được chữ ký + hạn dùng — không biết tài khoản có vừa bị vô hiệu hoá
// SAU khi token đã phát hành hay không (stateless). Cache 60s để tránh query
// DB mỗi request, đủ ngắn để việc vô hiệu hoá tài khoản có hiệu lực gần như
// ngay, thay vì phải chờ token tự hết hạn (tối đa 8h). Khoá tạm do đăng nhập
// sai (locked_until) cố ý không xét ở đây — xem middlewares/auth.js.
const _cache = new Map(); // user_id → { status: { isActive, roleId, departmentId, accountExpiresAt, tokenVersion, mustChangePassword, totpEnabled, twofaRequiredSince }, ts }
const TTL_MS = 60 * 1000;

const get = (userId) => {
	const entry = _cache.get(userId);
	if (entry && Date.now() - entry.ts < TTL_MS) return entry.status;
	return null;
};

const set = (userId, status) => {
	_cache.set(userId, { status, ts: Date.now() });
};

const clearLocal = (userId) => {
	if (userId) _cache.delete(userId);
	else _cache.clear();
};

// Xoá cache ở instance này VÀ báo các instance khác (utils/cacheBus.js).
const clear = (userId) => {
	clearLocal(userId);
	cacheBus.publish('userStatus', userId ?? null);
};
cacheBus.register('userStatus', clearLocal);

const load = async (userId) => {
	const cached = get(userId);
	if (cached) return cached;

	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.query(
			`SELECT is_active, role_id, department_id, account_expires_at, token_version, must_change_password,
			        totp_enabled, twofa_required_since FROM users WHERE id = @id`,
		);

	// role_id / department_id / account_expires_at lấy từ DB chứ không từ JWT:
	// JWT phát hành lúc đăng nhập, nên admin đổi vai trò / chuyển khoa / gia hạn
	// tài khoản sẽ không có hiệu lực tới khi token hết hạn (tối đa 8h). Cùng
	// định dạng ngày 'YYYY-MM-DD' với payload JWT (authService.issueTokens).
	const row = result.recordset[0];
	const status = {
		isActive: !!row?.is_active,
		roleId: row?.role_id ?? null,
		departmentId: row?.department_id ?? null,
		accountExpiresAt: row?.account_expires_at
			? new Date(row.account_expires_at).toISOString().split('T')[0]
			: null,
		tokenVersion: row?.token_version ?? 0,
		mustChangePassword: !!row?.must_change_password,
		totpEnabled: !!row?.totp_enabled,
		twofaRequiredSince: row?.twofa_required_since ?? null,
	};
	set(userId, status);
	return status;
};

module.exports = { load, clear };
