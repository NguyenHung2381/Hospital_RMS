const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/userController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');

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
router.get('/', authorize('admin', 'manager'), ctrl.getAll);

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
 *                 minLength: 6
 *                 example: "pass123"
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
	authorize('admin'),
	[
		body('username').notEmpty(),
		body('password').isLength({ min: 6 }),
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
router.delete('/:id', authorize('admin'), ctrl.removeOne);

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
 *             required: [new_password]
 *             properties:
 *               new_password:
 *                 type: string
 *                 minLength: 6
 *                 example: "newpass123"
 *     responses:
 *       200:
 *         description: Đặt lại mật khẩu thành công
 *       403:
 *         description: Không có quyền
 */
router.post(
	'/:id/reset-password',
	authorize('admin'),
	[body('new_password').isLength({ min: 5 })],
	validate,
	ctrl.resetPassword,
);

module.exports = router;
