const permCache = require('../../permissions/permissionCache');
const { hasPermission, scopeOf } = require('../../permissions/authz');
const { isScoped, scopeRank } = require('../../permissions/scopes');
const { httpError } = require('../../utils/httpError');

// Chốt chặn leo thang quyền — dùng chung cho quản lý vai trò và tài khoản.
// Nguyên tắc: một người KHÔNG có system:manage chỉ được tác động lên những gì
// "nhỏ hơn hoặc bằng" quyền của chính mình — cả về quyền lẫn PHẠM VI dữ liệu
// (vd có topics:read trong khoa thì không cấp được topics:read toàn viện).
// Không có lớp này thì:
//   - roles:manage tự gán system:manage cho vai trò của mình,
//   - users:create tạo tài khoản mang vai trò quản trị,
//   - users:update reset mật khẩu của quản trị viên rồi đăng nhập thay,
// tức là mọi quyền quản trị "một phần" đều nâng được thành superuser.
//
// Một "grant" = { key: "resource:action", scope: string | null }.

const SUPERUSER = 'system:manage';

const forbiddenError = (message) => httpError(403, message);

const isSuperuser = (actor) => !!actor?.permissions?.has(SUPERUSER);

const describe = ({ key, scope }) => (scope ? `${key}@${scope}` : key);

// actor có quyền `key` với phạm vi không hẹp hơn `scope`.
const holds = (actor, { key, scope }) => {
	const [resource, action] = key.split(':');
	if (!hasPermission(actor, resource, action)) return false;
	if (!isScoped(resource) || isSuperuser(actor)) return true;
	const own = scopeOf(actor, resource, action);
	return scopeRank(resource, own) >= scopeRank(resource, scope);
};

const grantsOf = (perms) =>
	[...perms.keys].map((key) => ({ key, scope: perms.scopes.get(key) ?? null }));

const missingFrom = (actor, grants) => grants.filter((g) => !holds(actor, g));

const listOf = (grants) =>
	`${grants.slice(0, 5).map(describe).join(', ')}${grants.length > 5 ? '…' : ''}`;

// Vai trò chỉ được gán (cho tài khoản mới hoặc hiện có) khi toàn bộ quyền của
// nó nằm trong quyền của người gán. Vai trò superuser chỉ superuser gán được.
const assertCanAssignRole = async (actor, roleId) => {
	if (isSuperuser(actor) || !roleId) return;
	const perms = await permCache.load(roleId);
	if (perms.keys.has(SUPERUSER)) {
		throw forbiddenError('Chỉ quản trị hệ thống mới được gán vai trò toàn quyền');
	}
	const missing = missingFrom(actor, grantsOf(perms));
	if (missing.length) {
		throw forbiddenError(
			`Không thể gán vai trò có quyền cao hơn quyền của bạn (${listOf(missing)})`,
		);
	}
};

// Sửa / xoá / reset mật khẩu một tài khoản: phải cùng khoa (nếu actor bị giới
// hạn theo khoa) và tài khoản đích không được mang quyền cao hơn actor.
const assertCanManageUser = async (actor, target) => {
	if (isSuperuser(actor)) return;
	if (scopeOf(actor, 'users') !== 'all' && target.department_id !== actor.department_id) {
		throw forbiddenError('Bạn không có quyền thao tác trên tài khoản ngoài khoa của mình');
	}
	try {
		await assertCanAssignRole(actor, target.role_id);
	} catch (err) {
		if (err.statusCode !== 403) throw err;
		throw forbiddenError('Không thể thao tác trên tài khoản có quyền cao hơn quyền của bạn');
	}
};

// Sửa thông tin / xoá / đổi quyền một vai trò.
const assertCanEditRole = async (actor, roleId) => {
	if (isSuperuser(actor)) return;
	if (actor?.role_id === roleId) {
		throw forbiddenError('Không được tự chỉnh sửa vai trò của chính mình');
	}
	const perms = await permCache.load(roleId);
	if (perms.keys.has(SUPERUSER)) {
		throw forbiddenError('Chỉ quản trị hệ thống mới được chỉnh sửa vai trò toàn quyền');
	}
	if (missingFrom(actor, grantsOf(perms)).length) {
		throw forbiddenError('Không thể chỉnh sửa vai trò có quyền cao hơn quyền của bạn');
	}
};

// Thay tập quyền của vai trò: mọi lượt cấp được THÊM, BỊ GỠ hoặc ĐỔI PHẠM VI
// đều phải nằm trong quyền actor đang có — không cấp được quyền (hay phạm vi)
// mình không có, cũng không gỡ được quyền nằm ngoài tầm kiểm soát của mình.
const assertCanChangeGrants = (actor, oldGrants, newGrants) => {
	if (isSuperuser(actor)) return;
	const same = (a, b) => a.key === b.key && (a.scope ?? null) === (b.scope ?? null);
	const changed = [
		...newGrants.filter((g) => !oldGrants.some((o) => same(o, g))),
		...oldGrants.filter((o) => !newGrants.some((g) => same(o, g))),
	];
	if (changed.some((g) => g.key === SUPERUSER)) {
		throw forbiddenError('Chỉ quản trị hệ thống mới được cấp hoặc gỡ quyền toàn quyền');
	}
	const missing = missingFrom(actor, changed);
	if (missing.length) {
		throw forbiddenError(`Không thể cấp hoặc gỡ quyền mà bạn không có: ${listOf(missing)}`);
	}
};

module.exports = {
	isSuperuser,
	assertCanAssignRole,
	assertCanManageUser,
	assertCanEditRole,
	assertCanChangeGrants,
};
