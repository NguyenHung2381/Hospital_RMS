const { getPool, sql, withTransaction } = require('../config/db');
const permCache = require('./permissionCache');
const { invalidate } = require('../utils/cache');
const { ALL_PERMISSIONS } = require('./catalog');
const { RESOURCE_SCOPES, isScoped, nullScopeFill } = require('./scopes');
const logger = require('../config/logger');

// Đồng bộ permissions/catalog.js → bảng `permissions` lúc server khởi động.
//   - Quyền có trong catalog, chưa có trong DB → INSERT. Nếu khai báo seedFrom:
//     cấp luôn cho mọi vai trò đang có quyền nguồn (tách quyền không làm ai mất
//     quyền đang dùng). Chỉ chạy ĐÚNG LẦN TẠO — về sau admin gỡ thì không cấp lại.
//   - Quyền đã có → cập nhật name/description/module/sort_order nếu khác.
//     resource/action của một id KHÔNG bao giờ bị đổi tự động (đổi nghĩa quyền
//     đang được cấp là thao tác nguy hiểm) — chỉ cảnh báo.
//   - Quyền có trong DB mà không có trong catalog → chỉ cảnh báo, không xoá
//     (xoá sẽ cascade gỡ khỏi mọi vai trò).
// Lỗi đồng bộ không chặn server khởi động: quyền cũ trong DB vẫn dùng được.
// dryRun: chỉ tính và trả về thay đổi, không ghi DB.
const syncPermissions = async ({ dryRun = false } = {}) => {
	const pool = await getPool();
	const existing = (
		await pool
			.request()
			.query('SELECT id, name, description, module, sort_order, resource, action FROM permissions')
	).recordset;
	const dbById = new Map(existing.map((r) => [r.id, r]));
	const dbIdByKey = new Map(existing.map((r) => [`${r.resource}:${r.action}`, r.id]));

	const warnings = [];
	const toInsert = [];
	const toUpdate = [];
	for (const perm of ALL_PERMISSIONS) {
		const row = dbById.get(perm.id);
		if (!row) {
			const clash = dbIdByKey.get(perm.key);
			if (clash) {
				warnings.push(
					`${perm.key}: DB đã có với id ${clash}, catalog khai báo id ${perm.id} — bỏ qua`,
				);
				continue;
			}
			toInsert.push(perm);
			continue;
		}
		if (row.resource !== perm.resource || row.action !== perm.action) {
			warnings.push(
				`${perm.id}: DB là ${row.resource}:${row.action}, catalog là ${perm.key} — giữ nguyên DB`,
			);
			continue;
		}
		if (
			row.name !== perm.name ||
			(row.description ?? '') !== (perm.description ?? '') ||
			row.module !== perm.module ||
			row.sort_order !== perm.sortOrder
		) {
			toUpdate.push(perm);
		}
	}
	const catalogIds = new Set(ALL_PERMISSIONS.map((p) => p.id));
	for (const row of existing) {
		if (!catalogIds.has(row.id)) {
			warnings.push(
				`${row.id} (${row.resource}:${row.action}) có trong DB nhưng không có trong catalog`,
			);
		}
	}

	if (dryRun) {
		return {
			inserted: toInsert.map((p) => p.key),
			updated: toUpdate.map((p) => p.key),
			seeded: 0,
			warnings,
		};
	}

	let seeded = 0;
	if (toInsert.length || toUpdate.length) {
		await withTransaction(async (transaction) => {
			for (const perm of toUpdate) {
				await new sql.Request(transaction)
					.input('id', sql.VarChar(20), perm.id)
					.input('name', sql.NVarChar(100), perm.name)
					.input('description', sql.NVarChar(500), perm.description ?? null)
					.input('module', sql.VarChar(50), perm.module)
					.input('sort_order', sql.Int, perm.sortOrder).query(`
            UPDATE permissions
            SET name = @name, description = @description, module = @module,
                sort_order = @sort_order, updated_at = GETDATE()
            WHERE id = @id
          `);
			}
			for (const perm of toInsert) {
				await new sql.Request(transaction)
					.input('id', sql.VarChar(20), perm.id)
					.input('name', sql.NVarChar(100), perm.name)
					.input('description', sql.NVarChar(500), perm.description ?? null)
					.input('module', sql.VarChar(50), perm.module)
					.input('sort_order', sql.Int, perm.sortOrder)
					.input('resource', sql.VarChar(50), perm.resource)
					.input('action', sql.VarChar(20), perm.action).query(`
            INSERT INTO permissions (id, name, description, module, sort_order, resource, action)
            VALUES (@id, @name, @description, @module, @sort_order, @resource, @action)
          `);

				const seedIds = (perm.seedFrom ?? []).map((k) => dbIdByKey.get(k)).filter(Boolean);
				if (!seedIds.length) continue;
				const req = new sql.Request(transaction).input('perm_id', sql.VarChar(20), perm.id);
				const params = seedIds.map((id, i) => {
					req.input(`s${i}`, sql.VarChar(20), id);
					return `@s${i}`;
				});
				// Quyền mới có phạm vi dữ liệu → chép phạm vi RỘNG NHẤT của các quyền
				// nguồn mà vai trò đang có (xếp hạng theo RESOURCE_SCOPES, không theo
				// chữ cái); quyền nguồn không có phạm vi → nullScopeFill. Quyền mới
				// không có phạm vi → scope NULL.
				const ranks = isScoped(perm.resource) ? RESOURCE_SCOPES[perm.resource] : null;
				const withScope = !!ranks;
				const rankExpr = withScope
					? `CASE rp.scope ${ranks.map((sc, i) => `WHEN '${sc}' THEN ${i}`).join(' ')} ELSE -1 END`
					: null;
				const scopeExpr = withScope
					? `CASE MAX(${rankExpr}) ${ranks.map((sc, i) => `WHEN ${i} THEN '${sc}'`).join(' ')} ELSE '${nullScopeFill(perm.resource)}' END`
					: null;
				const result = await req.query(`
          INSERT INTO role_permissions (role_id, permission_id${withScope ? ', scope' : ''})
          SELECT rp.role_id, @perm_id${withScope ? `, ${scopeExpr}` : ''}
          FROM role_permissions rp
          WHERE rp.permission_id IN (${params.join(',')})
            AND NOT EXISTS (
              SELECT 1 FROM role_permissions x
              WHERE x.role_id = rp.role_id AND x.permission_id = @perm_id
            )
          GROUP BY rp.role_id
        `);
				seeded += result.rowsAffected[0] ?? 0;
			}
		}, pool);
		permCache.clear();
		await invalidate('lookup:roles:');
	}

	for (const w of warnings) logger.warn(`⚠️  [permissions] ${w}`);
	if (toInsert.length || toUpdate.length) {
		logger.info(
			`✅ [permissions] Đồng bộ catalog: +${toInsert.length} quyền mới` +
				(seeded ? ` (cấp sẵn cho ${seeded} lượt vai trò)` : '') +
				`, ${toUpdate.length} quyền cập nhật tên/nhóm`,
		);
	}
	return {
		inserted: toInsert.map((p) => p.key),
		updated: toUpdate.map((p) => p.key),
		seeded,
		warnings,
	};
};

module.exports = { syncPermissions };
