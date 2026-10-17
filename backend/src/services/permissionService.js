const { getPool, sql, withTransaction } = require('../config/db');
const { broadcast } = require('../modules/events/eventService');
const permCache = require('../middlewares/permissionCache');
const { invalidate } = require('../utils/cache');
const { assertCanEditRole, assertCanChangeGrants } = require('./privilegeGuard');
const securityEvents = require('./securityEventService');
const roleService = require('./roleService');
const { MODULES, ACTION_LABELS, BY_KEY, impliesOf } = require('../permissions/catalog');
const { RESOURCE_SCOPES, SCOPE_LABELS, isScoped } = require('../permissions/scopes');
const { httpError, badRequest } = require('../utils/httpError');

// Danh mục quyền cho màn hình phân quyền: nhóm theo module → resource, kèm
// nhãn tiếng Việt và quan hệ "đi kèm". Chỉ trả những quyền đã có trong DB (id
// dùng được khi lưu) — quyền catalog chưa đồng bộ được (DB lỗi lúc khởi động)
// bị ẩn thay vì lưu ra lỗi khoá ngoại.
const getCatalog = async () => {
	const pool = await getPool();
	const rows = (
		await pool.request().query('SELECT id, name, description, resource, action FROM permissions')
	).recordset;
	const dbIds = new Set(rows.map((r) => r.id));
	const modules = MODULES.map((mod) => ({
		key: mod.key,
		label: mod.label,
		resources: mod.resources
			.map((res) => ({
				key: res.key,
				label: res.label,
				// Phạm vi dữ liệu chọn được (hẹp → rộng); null = resource không có phạm vi
				scopes: isScoped(res.key)
					? RESOURCE_SCOPES[res.key].map((key) => ({ key, label: SCOPE_LABELS[res.key][key] }))
					: null,
				permissions: res.permissions
					.filter((perm) => dbIds.has(perm.id))
					.map((perm) => {
						const entry = BY_KEY.get(`${res.key}:${perm.action}`);
						return {
							id: perm.id,
							key: entry.key,
							action: perm.action,
							name: perm.name,
							description: perm.description,
							critical: !!perm.critical,
							implies: impliesOf(entry)
								.map((k) => BY_KEY.get(k).id)
								.filter((id) => dbIds.has(id)),
						};
					}),
			}))
			.filter((res) => res.permissions.length),
	}));
	// Quyền có trong DB nhưng chưa khai báo trong catalog vẫn hiện (nhóm "Khác")
	// để không "biến mất" khỏi màn hình phân quyền.
	const others = rows.filter((r) => BY_KEY.get(`${r.resource}:${r.action}`)?.id !== r.id);
	if (others.length) {
		modules.push({
			key: 'other',
			label: 'Khác (chưa khai báo trong catalog)',
			resources: [{
				key: 'other',
				label: 'Khác',
				scopes: null,
				permissions: others.map((r) => ({
					id: r.id,
					key: `${r.resource}:${r.action}`,
					action: r.action,
					name: r.name,
					description: r.description,
					critical: false,
					implies: [],
				})),
			}],
		});
	}
	return { actionLabels: ACTION_LABELS, modules };
};

// id các tài khoản đang hoạt động có vai trò thoả `predicate` — predicate nhận
// một "user" tối giản ({ permissions, permissionScopes }) nên dùng được
// hasPermission / scopeOf như với req.user. Đi qua permCache ⇒ đúng ở cả mô
// hình phân quyền cũ lẫn mới, thay vì SQL đọc thẳng resource/action.
const findActiveUserIdsWhere = async (predicate) => {
	const pool = await getPool();
	const roles = (await pool.request().query('SELECT id FROM roles')).recordset;
	const roleIds = [];
	for (const { id } of roles) {
		const perms = await permCache.load(id);
		if (predicate({ permissions: perms.keys, permissionScopes: perms.scopes })) roleIds.push(id);
	}
	if (!roleIds.length) return [];
	const req = pool.request();
	const params = roleIds.map((id, i) => {
		req.input(`r${i}`, sql.VarChar(20), id);
		return `@r${i}`;
	});
	const result = await req.query(
		`SELECT id FROM users WHERE is_active = 1 AND role_id IN (${params.join(',')})`,
	);
	return result.recordset.map((r) => r.id);
};

// permission_id → "resource:action" của đúng các id truyền vào (bỏ id lạ).
const keysOf = async (pool, ids) => {
	if (!ids.length) return new Map();
	const req = pool.request();
	const params = ids.map((id, i) => {
		req.input(`p${i}`, sql.VarChar(20), id);
		return `@p${i}`;
	});
	const result = await req.query(
		`SELECT id, resource, action FROM permissions WHERE id IN (${params.join(',')})`,
	);
	return new Map(result.recordset.map((r) => [r.id, `${r.resource}:${r.action}`]));
};


// Các lượt cấp quyền của vai trò: [{ permission_id, key, scope }].
const loadGrants = async (pool, roleId) => {
	const result = await pool.request().input('role_id', sql.VarChar(20), roleId).query(`
      SELECT p.id, p.resource, p.action, rp.scope
      FROM permissions p
      INNER JOIN role_permissions rp ON rp.permission_id = p.id
      WHERE rp.role_id = @role_id
    `);
	return result.recordset.map((r) => ({
		permission_id: r.id,
		key: `${r.resource}:${r.action}`,
		scope: r.scope ?? null,
	}));
};

const getRolePermissions = async (roleId) => {
	const pool = await getPool();
	const grants = await loadGrants(pool, roleId);
	return grants.map(({ permission_id, scope }) => ({ permission_id, scope }));
};

// Ghi các lượt cấp quyền (permission_id + scope) cho 1 vai trò trong transaction đang mở.
const insertGrants = async (transaction, roleId, grants, actorId) => {
	for (const g of grants) {
		await new sql.Request(transaction)
			.input('role_id', sql.VarChar(20), roleId)
			.input('permission_id', sql.VarChar(20), g.permission_id)
			.input('scope', sql.VarChar(20), g.scope)
			.input('created_by', sql.VarChar(20), actorId)
			.query('INSERT INTO role_permissions (role_id, permission_id, scope, created_by) VALUES (@role_id, @permission_id, @scope, @created_by)');
	}
};

// Thay toàn bộ quyền của vai trò bằng `grants` = [{ permission_id, scope }].
// scope bắt buộc (và phải hợp lệ) với resource có phạm vi, phải bỏ trống với
// resource khác.
const setRolePermissions = async (roleId, grants, actor, ip = null) => {
	const pool = await getPool();
	const byId = new Map();
	for (const g of grants) {
		const id = String(g?.permission_id ?? '');
		if (!id) throw badRequest('Thiếu permission_id');
		if (byId.has(id)) throw badRequest(`Quyền bị lặp: ${id}`);
		byId.set(id, g.scope ?? null);
	}
	const ids = [...byId.keys()];
	const keysById = await keysOf(pool, ids);
	const unknown = ids.filter((id) => !keysById.has(id));
	if (unknown.length) throw badRequest(`Quyền không tồn tại: ${unknown.join(', ')}`);

	const newGrants = ids.map((id) => {
		const key = keysById.get(id);
		const [resource] = key.split(':');
		const scope = byId.get(id);
		if (isScoped(resource)) {
			if (!RESOURCE_SCOPES[resource].includes(scope)) {
				throw badRequest(
					`Phạm vi của ${key} phải là một trong: ${RESOURCE_SCOPES[resource].join(', ')}`,
				);
			}
		} else if (scope !== null) {
			throw badRequest(`${key} không có phạm vi dữ liệu`);
		}
		return { permission_id: id, key, scope };
	});

	await assertCanEditRole(actor, roleId);
	const oldGrants = await loadGrants(pool, roleId);
	assertCanChangeGrants(actor, oldGrants, newGrants);

	await withTransaction(async (transaction) => {
		await new sql.Request(transaction)
			.input('role_id', sql.VarChar(20), roleId)
			.query('DELETE FROM role_permissions WHERE role_id = @role_id');

		await insertGrants(transaction, roleId, newGrants, actor.id);
	}, pool);

	permCache.clear(roleId); // xóa cache để hiệu lực ngay
	const label = (g) => (g.scope ? `${g.key}@${g.scope}` : g.key);
	const oldLabels = oldGrants.map(label);
	const newLabels = newGrants.map(label);
	const added = newLabels.filter((k) => !oldLabels.includes(k));
	const removed = oldLabels.filter((k) => !newLabels.includes(k));
	if (added.length || removed.length) {
		await securityEvents.log({
			eventType: 'role_permissions_changed',
			actorId: actor.id,
			targetType: 'role',
			targetId: roleId,
			ip,
			detail: `+[${added.join(', ')}] -[${removed.join(', ')}]`.slice(0, 1000),
		});
	}
	await invalidate('lookup:roles:'); // permission_count trong danh sách roles vừa đổi
	broadcast('update', { entity: 'role' });
	return getRolePermissions(roleId);
};

// Nhân bản vai trò: tạo vai trò mới (tên / mô tả mới) mang đúng các lượt cấp
// quyền + phạm vi của vai trò nguồn. Cờ is_system / is_superuser KHÔNG được
// chép — bản sao luôn là vai trò thường. Người nhân bản phải có mọi quyền được
// chép (không nhân bản để "lách" chốt chặn cấp quyền).
const cloneRole = async (sourceId, data, actor, ip = null) => {
	const pool = await getPool();
	const exists = await pool.request().input('id', sql.VarChar(20), sourceId).query('SELECT id FROM roles WHERE id = @id');
	if (!exists.recordset[0]) throw httpError(404, 'Không tìm thấy vai trò nguồn');

	const grants = await loadGrants(pool, sourceId);
	assertCanChangeGrants(actor, [], grants);

	const role = await roleService.create({ name: data.name, description: data.description }, actor.id);
	try {
		await withTransaction((transaction) => insertGrants(transaction, role.id, grants, actor.id), pool);
	} catch (err) {
		await roleService.remove(role.id, actor.id).catch(() => {}); // không để lại vai trò rỗng
		throw err;
	}

	await securityEvents.log({
		eventType: 'role_cloned',
		actorId: actor.id,
		targetType: 'role',
		targetId: role.id,
		ip,
		detail: `từ ${sourceId}, ${grants.length} quyền`,
	});
	await invalidate('lookup:roles:');
	broadcast('update', { entity: 'role' });
	return { ...role, permission_count: grants.length };
};

module.exports = {
	cloneRole,
	getCatalog,
	getRolePermissions,
	setRolePermissions,
	findActiveUserIdsWhere,
};
