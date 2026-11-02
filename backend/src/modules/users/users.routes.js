const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('./userController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { passwordRule } = require('../../utils/passwordPolicy');
const { formConfigGuard } = require('../forms/formConfigGuard');

router.use(authenticate);

router.get('/me', ctrl.getMe);

// Hồ sơ cá nhân: đổi họ tên và/hoặc trường tùy chỉnh (Cấu hình form 'user_profile')
router.patch(
	'/me',
	[body('full_name').optional().isString().trim().notEmpty().isLength({ max: 200 })],
	validate,
	formConfigGuard('user_profile', { variant: 'profile', mode: 'update' }),
	ctrl.updateMe,
);

router.get('/', authorizePermission(['users', 'read']), ctrl.getAll);

router.get('/search', ctrl.searchMembers);

router.post('/export-excel', authorizePermission(['users', 'read']), ctrl.exportExcel);

router.get('/:id', ctrl.getById);

router.post(
	'/',
	authorizePermission(['users', 'create']),
	[
		body('username').notEmpty(),
		// Bỏ trống ⇒ mật khẩu mặc định = tên đăng nhập (userService.create)
		body('password').optional({ values: 'falsy' }).custom(passwordRule('username')),
		body('full_name').notEmpty(),
	],
	validate,
	ctrl.createOne,
);

router.put(
	'/:id',
	authorizePermission(['users', 'update']),
	[body('full_name').optional().notEmpty()],
	validate,
	ctrl.updateOne,
);

router.delete('/:id', authorizePermission(['users', 'delete']), ctrl.removeOne);

router.post(
	'/:id/reset-password',
	authorizePermission(['users', 'update']),
	// Bỏ trống new_password ⇒ đặt về mật khẩu mặc định = TÊN ĐĂNG NHẬP (dễ đoán,
	// không phải chuỗi ngẫu nhiên — userService.resetPassword). Dù đặt tay hay mặc
	// định, người dùng phải đổi ở lần đăng nhập tới và mật khẩu tạm chỉ dùng được
	// trong TEMP_PASSWORD_TTL_DAYS ngày (permissions/tempPasswordPolicy.js).
	[body('new_password').optional({ values: 'falsy' }).custom(passwordRule())],
	validate,
	ctrl.resetPassword,
);

module.exports = router;
