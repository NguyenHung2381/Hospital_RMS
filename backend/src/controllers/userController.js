const userService = require('../services/userService');
const { success, created, notFound, forbidden } = require('../utils/response');
const { createCrudController } = require('./crudController');
const { scopeOf, hasPermission } = require('../middlewares/auth');
const {
	isSuperuser,
	assertCanAssignRole,
	assertCanManageUser,
} = require('../services/privilegeGuard');

const base = createCrudController(userService);

// Chỉ được xem/sửa tài khoản ngoài khoa khi quyền users có phạm vi 'all' (hoặc
// superuser). Mọi vai trò khác bị giới hạn trong khoa của mình.
const isDeptScoped = (actor) => scopeOf(actor, 'users') !== 'all';

const getAll = async (req, res, next) => {
	try {
		const actor = req.user;
		const query = { ...req.query };
		if (isDeptScoped(actor)) {
			query.department_id = actor.department_id;
		}
		const result = await userService.getAll(query);
		return success(res, result);
	} catch (err) {
		next(err);
	}
};

// Các field liên quan đến phân quyền — chỉ superuser mới được đổi, để tránh
// một vai trò có quyền users:update tự nâng quyền qua endpoint này.
const PRIVILEGED_FIELDS = ['role_id', 'can_sit_council', 'can_chair_council'];

// Xem 1 tài khoản: chính mình luôn được; người khác cần users:read và (nếu bị
// giới hạn theo khoa) phải cùng khoa.
const getById = async (req, res, next) => {
	try {
		const actor = req.user;
		const isSelf = req.params.id === actor.id;
		if (!isSelf && !hasPermission(actor, 'users', 'read')) {
			return forbidden(res, 'Không đủ quyền thực hiện thao tác này');
		}
		const item = await userService.getById(req.params.id);
		if (!item) return notFound(res);
		if (!isSelf && isDeptScoped(actor) && item.department_id !== actor.department_id) {
			return forbidden(res, 'Bạn không có quyền xem tài khoản ngoài khoa của mình');
		}
		return success(res, item);
	} catch (err) {
		next(err);
	}
};

// Tạo tài khoản: vai trò được gán không được cao hơn quyền người tạo, và
// người bị giới hạn theo khoa chỉ tạo được tài khoản trong khoa mình.
const createOne = async (req, res, next) => {
	try {
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
	} catch (err) {
		next(err);
	}
};

// Nạp tài khoản đích + kiểm tra actor được phép thao tác trên nó.
const loadManageableTarget = async (actor, id) => {
	const target = await userService.getById(id);
	if (target) await assertCanManageUser(actor, target);
	return target;
};

const updateOne = async (req, res, next) => {
	try {
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
	} catch (err) {
		next(err);
	}
};

const removeOne = async (req, res, next) => {
	try {
		const actor = req.user;
		if (req.params.id === actor.id) {
			return forbidden(res, 'Không thể tự xoá tài khoản của chính mình');
		}
		const target = await loadManageableTarget(actor, req.params.id);
		if (!target) return notFound(res);
		await userService.remove(req.params.id, actor.id);
		return success(res, null, 'Xóa thành công');
	} catch (err) {
		next(err);
	}
};

const resetPassword = async (req, res, next) => {
	try {
		const target = await loadManageableTarget(req.user, req.params.id);
		if (!target) return notFound(res);
		const data = await userService.resetPassword(
			req.params.id,
			req.body.new_password || null,
			req.user.id,
			req.ip,
		);
		return success(res, data, 'Reset mật khẩu thành công');
	} catch (err) {
		next(err);
	}
};

const getMe = async (req, res, next) => {
	try {
		const user = await userService.getById(req.user.id);
		if (!user) return notFound(res);
		// Kèm tập quyền để client tái tạo điều hướng sau khi tải lại trang.
		return success(res, {
			...user,
			permissions: [...(req.user.permissions ?? [])],
			permission_scopes: Object.fromEntries(req.user.permissionScopes ?? []),
			// Trạng thái 2FA bắt buộc tính lại theo cấu hình hiện tại — bản lưu lúc
			// đăng nhập sẽ cũ nếu quản trị vừa bật/tắt "Bắt buộc 2FA cho quản trị".
			twofa_state: req.user.twoFactor?.state ?? null,
			twofa_deadline: req.user.twoFactor?.deadline ? req.user.twoFactor.deadline.toISOString() : null,
		});
	} catch (err) {
		next(err);
	}
};

// Chỉ lấy đúng các trường người dùng được tự sửa — không nhận role/khoa/trạng thái.
const updateMe = async (req, res, next) => {
	try {
		const item = await userService.update(
			req.user.id,
			{ full_name: req.body.full_name },
			req.user.id,
		);
		if (!item) return notFound(res);
		return success(res, item, 'Cập nhật thành công');
	} catch (err) {
		next(err);
	}
};

const searchMembers = async (req, res, next) => {
	try {
		const { q = '', department_id, limit = 10 } = req.query;
		// Mở cho mọi tài khoản đăng nhập (chọn người khi thêm thành viên) và có trả
		// email — bắt buộc có từ khoá + tối đa 20 kết quả, không để tải cả danh bạ
		// nhân viên bằng 1 request (trước đây limit không giới hạn, q rỗng trả tất cả).
		if (!String(q).trim()) {
			return success(res, { data: [], pagination: { page: 1, limit: 0, total: 0 } });
		}
		const result = await userService.searchForMember({
			q: String(q),
			department_id,
			limit: Math.min(Math.max(Number(limit) || 10, 1), 20),
		});
		return success(res, result);
	} catch (err) {
		next(err);
	}
};

module.exports = {
	...base,
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
