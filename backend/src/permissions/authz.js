const { scopeRank } = require('./scopes');

// Hỏi quyền của một người dùng đã xác thực (req.user do middlewares/auth.js
// nạp: permissions = Set<"resource:action">, permissionScopes = Map<key, scope>).
// Hàm thuần, không đụng request/DB — service, controller và middleware dùng
// chung, nên service không phải require middleware.

// Có ĐÚNG quyền "resource:action" (hoặc là superuser). "manage" không còn là
// wildcard — xem permissions/catalog.js.
const hasPermission = (user, resource, action) => {
	const perms = user?.permissions;
	if (!perms) return false;
	return perms.has('system:manage') || perms.has(`${resource}:${action}`);
};

// Phạm vi dữ liệu của actor trên một resource có phạm vi (permissions/scopes.js):
//   topics:  'own' | 'department' | 'all'
//   users:   'department' | 'all'
//   courses: 'assigned' | 'all'
// Lấy theo lượt cấp quyền `resource:action` (mặc định action 'read' — phạm vi
// XEM, quyết định danh sách/chi tiết thấy được). Không có quyền đó → phạm vi
// rộng nhất trong các quyền khác của resource; không có quyền nào → null.
const scopeOf = (user, resource, action = 'read') => {
	const perms = user?.permissions;
	if (!perms) return null;
	if (perms.has('system:manage')) return 'all';
	const scopes = user.permissionScopes;
	const direct = scopes?.get(`${resource}:${action}`);
	if (direct) return direct;
	let best = null;
	for (const [key, scope] of scopes ?? []) {
		if (!key.startsWith(`${resource}:`)) continue;
		if (best === null || scopeRank(resource, scope) > scopeRank(resource, best)) best = scope;
	}
	return best;
};

// Chỉ thấy đề tài mình tham gia ⇒ bị chặn theo mốc thời gian (deadline) của đợt.
const isDeadlineBound = (user) => (scopeOf(user, 'topics') ?? 'own') === 'own';

module.exports = { hasPermission, scopeOf, isDeadlineBound };
