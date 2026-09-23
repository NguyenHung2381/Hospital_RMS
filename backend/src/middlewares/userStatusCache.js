const { getPool, sql } = require('../config/db');

// Lớp xác thực thứ 2 cho các API cần token: JWT (middlewares/auth.js) chỉ xác
// minh được chữ ký + hạn dùng — không biết tài khoản có vừa bị khoá/vô hiệu
// hoá SAU khi token đã phát hành hay không (stateless). Cache 60s để tránh
// query DB mỗi request, đủ ngắn để việc khoá/vô hiệu hoá tài khoản có hiệu
// lực gần như ngay, thay vì phải chờ token tự hết hạn (tối đa 8h).
const _cache = new Map(); // user_id → { status, ts }
const TTL_MS = 60 * 1000;

const get = (userId) => {
	const entry = _cache.get(userId);
	if (entry && Date.now() - entry.ts < TTL_MS) return entry.status;
	return null;
};

const set = (userId, status) => {
	_cache.set(userId, { status, ts: Date.now() });
};

const clear = (userId) => {
	if (userId) _cache.delete(userId);
	else _cache.clear();
};

const load = async (userId) => {
	const cached = get(userId);
	if (cached) return cached;

	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.query(`SELECT is_active, locked_until FROM users WHERE id = @id`);

	const row = result.recordset[0];
	const status = row
		? { isActive: !!row.is_active, lockedUntil: row.locked_until }
		: { isActive: false, lockedUntil: null };
	set(userId, status);
	return status;
};

module.exports = { load, clear };
