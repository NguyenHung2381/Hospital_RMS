const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/userController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');
const { passwordRule } = require('../utils/passwordPolicy');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Quản lý người dùng
 */

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Lấy thông tin người dùng hiện tại
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Thông tin tài khoản đang đăng nhập
 *       401:
 *         description: Chưa xác thực
 */
router.get('/me', ctrl.getMe);

/**
 * @swagger
 * /users/me:
 *   patch:
 *     summary: Tự cập nhật thông tin tài khoản (hiện chỉ họ tên)
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */
router.patch(
	'/me',
	[body('full_name').isString().trim().notEmpty().isLength({ max: 200 })],
	validate,
	ctrl.updateMe,
);

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Lấy danh sách người dùng
 *     tags: [Users]
 *     description: Chỉ admin và manager mới có quyền truy cập
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 20
 *     responses:
 *       200:
 *         description: Danh sách người dùng
 *       403:
 *         description: Không có quyền truy cập
 */
router.get('/', authorizePermission(['users', 'read']), ctrl.getAll);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Lấy thông tin một người dùng theo ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "USR001"
 *     responses:
 *       200:
 *         description: Thông tin người dùng
 *       404:
 *         description: Không tìm thấy người dùng
 */
router.get('/search', ctrl.searchMembers);

router.get('/:id', ctrl.getById);

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Tạo người dùng mới
 *     tags: [Users]
 *     description: Chỉ admin mới có quyền
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password, full_name]
 *             properties:
 *               username:
 *                 type: string
 *                 example: "nguyen.van.a"
 *               password:
 *                 type: string
 *                 minLength: 10
 *                 example: "Tamthoi2026x"
 *               full_name:
 *                 type: string
 *                 example: "Nguyễn Văn A"
 *     responses:
 *       201:
 *         description: Tạo người dùng thành công
 *       403:
 *         description: Không có quyền
 */
router.post(
	'/',
	authorizePermission(['users', 'create']),
	[
		body('username').notEmpty(),
		body('password').custom(passwordRule('username')),
		body('full_name').notEmpty(),
	],
	validate,
	ctrl.createOne,
);

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Cập nhật thông tin người dùng
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *                 example: "Nguyễn Văn B"
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       404:
 *         description: Không tìm thấy người dùng
 */
router.put(
	'/:id',
	authorizePermission(['users', 'update']),
	[body('full_name').optional().notEmpty()],
	validate,
	ctrl.updateOne,
);

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Xoá người dùng
 *     tags: [Users]
 *     description: Chỉ admin mới có quyền
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Xoá thành công
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy người dùng
 */
router.delete('/:id', authorizePermission(['users', 'delete']), ctrl.removeOne);

/**
 * @swagger
 * /users/{id}/reset-password:
 *   post:
 *     summary: Đặt lại mật khẩu người dùng
 *     tags: [Users]
 *     description: Chỉ admin mới có quyền
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Bỏ trống new_password để server tự sinh mật khẩu tạm (trả về trong data.temporary_password)
 *             properties:
 *               new_password:
 *                 type: string
 *                 minLength: 10
 *                 example: "Newpass2026x"
 *     responses:
 *       200:
 *         description: Đặt lại mật khẩu thành công
 *       403:
 *         description: Không có quyền
 */
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
