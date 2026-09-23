const { getPool, sql } = require('../config/db');

const _cache = new Map(); // role_id → { perms: Set<"resource:action">, ts: number }
const TTL_MS = 5 * 60 * 1000; // 5 phút

const get = (roleId) => {
	const entry = _cache.get(roleId);
	if (entry && Date.now() - entry.ts < TTL_MS) return entry.perms;
	return null;
};

const set = (roleId, perms) => {
	_cache.set(roleId, { perms, ts: Date.now() });
};

const clear = (roleId) => {
	if (roleId) _cache.delete(roleId);
	else _cache.clear();
};

const load = async (roleId) => {
	const cached = get(roleId);
	if (cached) return cached;

	const pool = await getPool();
	const result = await pool
		.request()
		.input('role_id', sql.VarChar(20), roleId)
		.query(`
      SELECT p.resource, p.action
      FROM permissions p
      INNER JOIN role_permissions rp ON rp.permission_id = p.id
      WHERE rp.role_id = @role_id
    `);

	const perms = new Set(result.recordset.map((r) => `${r.resource}:${r.action}`));
	set(roleId, perms);
	return perms;
};

module.exports = { load, clear };
