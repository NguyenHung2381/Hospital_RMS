const userService = require('../services/userService');
const { success, notFound, forbidden } = require('../utils/response');
const { createCrudController } = require('./crudController');

const base = createCrudController(userService);

const getAll = async (req, res, next) => {
	try {
		const actor = req.user;
		const query = { ...req.query };
		if (actor.account_type === 'dept') {
			query.department_id = actor.department_id;
		}
		const result = await userService.getAll(query);
		return success(res, result);
	} catch (err) {
		next(err);
	}
};

// Các field liên quan đến phân quyền — chỉ admin mới được đổi, để tránh
// một role không phải admin nhưng có quyền users:update tự nâng quyền qua endpoint này.
const ADMIN_ONLY_FIELDS = [
	'account_type',
	'role_id',
	'can_sit_council',
	'can_chair_council',
];

const updateOne = async (req, res, next) => {
	try {
		const actor = req.user;
		if (actor.account_type === 'dept') {
			const target = await userService.getById(req.params.id);
			if (!target) return notFound(res);
			if (target.department_id !== actor.department_id) {
				return forbidden(
					res,
					'Bạn không có quyền chỉnh sửa tài khoản ngoài khoa của mình',
				);
			}
		}
		const data = { ...req.body };
		if (actor.account_type !== 'admin') {
			for (const field of ADMIN_ONLY_FIELDS) delete data[field];
		}
		const item = await userService.update(req.params.id, data, actor.id);
		if (!item) return notFound(res);
		return success(res, item, 'Cập nhật thành công');
	} catch (err) {
		next(err);
	}
};

const resetPassword = async (req, res, next) => {
	try {
		await userService.resetPassword(
			req.params.id,
			req.body.new_password,
			req.user.id,
		);
		return success(res, null, 'Reset mật khẩu thành công');
	} catch (err) {
		next(err);
	}
};

const getMe = async (req, res, next) => {
	try {
		const user = await userService.getById(req.user.id);
		if (!user) return notFound(res);
		return success(res, user);
	} catch (err) {
		next(err);
	}
};

const searchMembers = async (req, res, next) => {
	try {
		const { q = '', department_id, limit = 10 } = req.query;
		const result = await userService.searchForMember({
			q,
			department_id,
			limit,
		});
		return success(res, result);
	} catch (err) {
		next(err);
	}
};

module.exports = {
	...base,
	getAll,
	updateOne,
	resetPassword,
	getMe,
	searchMembers,
};
