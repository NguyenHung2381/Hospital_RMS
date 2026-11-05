const userService = require('./userService');
const formCustomValueService = require('../forms/formCustomValueService');
const { success, created, notFound, forbidden, sendWorkbook } = require('../../utils/response');
const { buildUserListWorkbook } = require('./exports/userListWorkbook');
const { createCrudController } = require('../../shared/crudController');
const { scopeOf, hasPermission } = require('../../permissions/authz');
const { asyncHandler } = require('../../utils/asyncHandler');
const { httpError } = require('../../utils/httpError');
const { ROLE, roleIdOf } = require('../access/roleCodes');
const {
	isSuperuser,
	assertCanAssignRole,
	assertCanManageUser,
} = require('../access/privilegeGuard');

const base = createCrudController(userService);

// Chỉ được xem/sửa tài khoản ngoài khoa khi quyền users có phạm vi 'all' (hoặc
// superuser). Mọi vai trò khác bị giới hạn trong khoa của mình.
const isDeptScoped = (actor) => scopeOf(actor, 'users') !== 'all';

const getAll = asyncHandler(async (req, res) => {
	const actor = req.user;
	const query = { ...req.query };
	if (isDeptScoped(actor)) {
		// Bị giới hạn theo khoa mà tài khoản chưa có khoa ⇒ không thấy ai (không để
		// department_id = NULL thành "không lọc" = mọi khoa).
		if (!actor.department_id)
			return success(res, { data: [], pagination: { page: 1, limit: 0, total: 0 } });
		query.department_id = actor.department_id;
	}
	const result = await userService.getAll(query);
	return success(res, result);
});

// Các field liên quan đến phân quyền — chỉ superuser mới được đổi, để tránh
// một vai trò có quyền users:update tự nâng quyền qua endpoint này.
const PRIVILEGED_FIELDS = ['role_id', 'can_sit_council', 'can_chair_council'];

// Xem 1 tài khoản: chính mình luôn được; người khác cần users:read và (nếu bị
// giới hạn theo khoa) phải cùng khoa.
const getById = asyncHandler(async (req, res) => {
	const actor = req.user;
	const isSelf = req.params.id === actor.id;
	if (!isSelf && !hasPermission(actor, 'users', 'read')) {
		return forbidden(res, 'Không đủ quyền thực hiện thao tác này');
	}
	const item = await userService.getById(req.params.id);
	if (!item) return notFound(res);
	if (
		!isSelf &&
		isDeptScoped(actor) &&
		(!actor.department_id || item.department_id !== actor.department_id)
	) {
		return forbidden(res, 'Bạn không có quyền xem tài khoản ngoài khoa của mình');
	}
	return success(res, item);
});

// Tạo tài khoản: vai trò được gán không được cao hơn quyền người tạo, và
// người bị giới hạn theo khoa chỉ tạo được tài khoản trong khoa mình.
const createOne = asyncHandler(async (req, res) => {
	const actor = req.user;
	const data = { ...req.body };
	if (!isSuperuser(actor)) {
		delete data.can_sit_council;
		delete data.can_chair_council;
	}
	if (isDeptScoped(actor)) data.department_id = actor.department_id;
	if (data.role_id) await assertCanAssignRole(actor, data.role_id);
	const item = await userService.create(data, actor.id);
	return created(res, item);
});

// Tài khoản học viên theo vòng đời hồ sơ học viên (xóa / ngừng học ⇒ khóa) — chỉ
// thao tác qua /trainees/:id/account, nơi có các kiểm tra đó. Ở đây bật lại /
// đặt lại mật khẩu là vượt qua chúng.
const TRAINEE_ACCOUNT_MSG =
	'Tài khoản học viên được quản lý tại hồ sơ học viên (Đào tạo → Học viên → Tài khoản).';

// Nạp tài khoản đích + kiểm tra actor được phép thao tác trên nó.
const loadManageableTarget = async (actor, id) => {
	const target = await userService.getById(id);
	if (!target) return null;
	if (target.role_code === ROLE.TRAINEE) throw httpError(403, TRAINEE_ACCOUNT_MSG);
	await assertCanManageUser(actor, target);
	return target;
};

const updateOne = asyncHandler(async (req, res) => {
	const actor = req.user;
	const target = await loadManageableTarget(actor, req.params.id);
	if (!target) return notFound(res);
	const data = { ...req.body };
	if (!isSuperuser(actor)) {
		for (const field of PRIVILEGED_FIELDS) delete data[field];
	}
	// Phạm vi khoa không được chuyển tài khoản sang khoa khác: tài khoản có
	// phạm vi dữ liệu theo khoa sẽ nhìn thấy dữ liệu của khoa mới — tức là
	// quản lý khoa A tự mở quyền xem khoa B cho người của mình.
	if (
		isDeptScoped(actor) &&
		data.department_id !== undefined &&
		data.department_id !== actor.department_id
	) {
		return forbidden(res, 'Bạn không thể chuyển tài khoản sang khoa/phòng khác');
	}
	const item = await userService.update(req.params.id, data, actor.id);
	if (!item) return notFound(res);
	return success(res, item, 'Cập nhật thành công');
});

const removeOne = asyncHandler(async (req, res) => {
	const actor = req.user;
	if (req.params.id === actor.id) {
		return forbidden(res, 'Không thể tự xóa tài khoản của chính mình');
	}
	const target = await loadManageableTarget(actor, req.params.id);
	if (!target) return notFound(res);
	await userService.remove(req.params.id, actor.id);
	return success(res, null, 'Xóa thành công');
});

const resetPassword = asyncHandler(async (req, res) => {
	const target = await loadManageableTarget(req.user, req.params.id);
	if (!target) return notFound(res);
	const data = await userService.resetPassword(
		req.params.id,
		req.body.new_password || null,
		req.user.id,
		req.ip,
	);
	return success(res, data, 'Đặt lại mật khẩu thành công');
});

const getMe = asyncHandler(async (req, res) => {
	const user = await userService.getById(req.user.id);
	if (!user) return notFound(res);
	// Kèm tập quyền để client tái tạo điều hướng sau khi tải lại trang.
	return success(res, {
		...user,
		custom: await formCustomValueService.get('user_profile', req.user.id),
		permissions: [...(req.user.permissions ?? [])],
		permission_scopes: Object.fromEntries(req.user.permissionScopes ?? []),
		// Trạng thái 2FA bắt buộc tính lại theo cấu hình hiện tại — bản lưu lúc
		// đăng nhập sẽ cũ nếu quản trị vừa bật/tắt "Bắt buộc 2FA cho quản trị".
		twofa_state: req.user.twoFactor?.state ?? null,
		twofa_deadline: req.user.twoFactor?.deadline ? req.user.twoFactor.deadline.toISOString() : null,
	});
});

// Chỉ lấy đúng các trường người dùng được tự sửa — không nhận role/khoa/trạng thái.
const updateMe = asyncHandler(async (req, res) => {
	let item = null;
	if (req.body.full_name !== undefined) {
		item = await userService.update(req.user.id, { full_name: req.body.full_name }, req.user.id);
		if (!item) return notFound(res);
	}
	const custom = await formCustomValueService.save(
		'user_profile',
		req.user.id,
		req.formCustom,
		req.user.id,
	);
	return success(res, { ...item, ...(custom ? { custom } : {}) }, 'Cập nhật thành công');
});

const searchMembers = asyncHandler(async (req, res) => {
	const { q = '', department_id, limit = 10 } = req.query;
	// Mở cho mọi tài khoản đăng nhập (chọn người khi thêm thành viên) — bắt buộc
	// có từ khóa + tối đa 20 kết quả, email chỉ trả bản đã che (userService
	// .searchForMember), không để gom danh bạ email nhân viên.
	// Tài khoản học viên (người ngoài viện) không có chức năng chọn thành viên —
	// chặn hẳn để không dò được danh bạ nhân viên (tên đăng nhập, email, mã NV).
	if (req.user.role_id && req.user.role_id === (await roleIdOf(ROLE.TRAINEE))) {
		return forbidden(res, 'Không đủ quyền thực hiện thao tác này');
	}
	if (!String(q).trim()) {
		return success(res, { data: [], pagination: { page: 1, limit: 0, total: 0 } });
	}
	const result = await userService.searchForMember({
		q: String(q),
		department_id,
		limit: Math.min(Math.max(Number(limit) || 10, 1), 20),
	});
	return success(res, result);
});

// Xuất Excel đúng tập đang lọc trên trang (mọi trang), cùng giới hạn khoa như getAll.
const exportExcel = asyncHandler(async (req, res) => {
	const actor = req.user;
	const { search, department_id, role_id } = req.body || {};
	const { data } = await userService.getAll({
		search,
		department_id: isDeptScoped(actor) ? actor.department_id : department_id,
		role_id,
		page: 1,
		limit: 0,
		meta: '0',
	});

	const wb = buildUserListWorkbook(data);
	return sendWorkbook(res, wb, 'danh-sach-nguoi-dung.xlsx');
});

module.exports = {
	...base,
	exportExcel,
	getAll,
	getById,
	createOne,
	updateOne,
	removeOne,
	resetPassword,
	getMe,
	updateMe,
	searchMembers,
};
