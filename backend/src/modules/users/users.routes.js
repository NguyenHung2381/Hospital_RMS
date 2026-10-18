const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('./userController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { passwordRule } = require('../../utils/passwordPolicy');

router.use(authenticate);

router.get('/me', ctrl.getMe);

router.patch(
	'/me',
	[body('full_name').isString().trim().notEmpty().isLength({ max: 200 })],
	validate,
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
	// Bỏ trống new_password ⇒ server tự sinh mật khẩu tạm ngẫu nhiên và trả về 1
	// lần. Dù đặt tay hay tự sinh, người dùng đều phải đổi ở lần đăng nhập tới.
	[body('new_password').optional({ values: 'falsy' }).custom(passwordRule())],
	validate,
	ctrl.resetPassword,
);

module.exports = router;
