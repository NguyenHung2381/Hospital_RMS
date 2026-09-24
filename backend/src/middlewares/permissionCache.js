const { getPool, sql } = require('../config/db');
const schema = require('../utils/schema');
const cacheBus = require('../utils/cacheBus');

// role_id → { perms: { keys: Set<"resource:action">, scopes: Map<key, scope> }, ts }
const _cache = new Map();
const TTL_MS = 5 * 60 * 1000; // 5 phút

// Superuser là cờ roles.is_superuser. Trong bộ quyền nạp vào req.user nó hiện
// dưới dạng key 'system:manage' để mọi chỗ kiểm tra (hasPermission,
// privilegeGuard, frontend) dùng chung một cách hỏi.
// CSDL phải đã nâng cấp — permissions/index.js kiểm tra lúc khởi động.
const SUPERUSER_KEY = 'system:manage';

const get = (roleId) => {
	const entry = _cache.get(roleId);
	if (entry && Date.now() - entry.ts < TTL_MS) return entry.perms;
	return null;
};

const set = (roleId, perms) => {
	_cache.set(roleId, { perms, ts: Date.now() });
};

const clearLocal = (roleId) => {
	if (roleId) _cache.delete(roleId);
	else _cache.clear();
};

// Xoá cache (1 vai trò, hoặc tất cả) ở instance này VÀ báo các instance khác.
const clear = (roleId) => {
	clearLocal(roleId);
	cacheBus.publish('permissions', roleId ?? null);
};
cacheBus.register('permissions', clearLocal);

// Gọi sau khi migration đổi schema / dữ liệu phân quyền.
const resetSchemaCheck = () => {
	schema.reset();
	_cache.clear();
};

const load = async (roleId) => {
	const cached = get(roleId);
	if (cached) return cached;

	const pool = await getPool();
	const result = await pool
		.request()
		.input('role_id', sql.VarChar(20), roleId)
		.query(`
      SELECT p.resource, p.action, rp.scope
      FROM permissions p
      INNER JOIN role_permissions rp ON rp.permission_id = p.id
      WHERE rp.role_id = @role_id;
      SELECT is_superuser FROM roles WHERE id = @role_id;
    `);

	const keys = new Set();
	const scopes = new Map();
	for (const r of result.recordsets[0]) {
		const key = `${r.resource}:${r.action}`;
		keys.add(key);
		if (r.scope) scopes.set(key, r.scope);
	}
	if (result.recordsets[1][0]?.is_superuser) keys.add(SUPERUSER_KEY);
	const perms = { keys, scopes };
	set(roleId, perms);
	return perms;
};

module.exports = { load, clear, resetSchemaCheck };
