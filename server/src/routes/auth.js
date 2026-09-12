const router = require('express').Router();
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');

const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 phút
	limit: 10, // tối đa 10 lần thử đăng nhập / IP / cửa sổ thời gian
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		success: false,
		message: 'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau ít phút.',
	},
});

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Xác thực người dùng
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Đăng nhập
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *                 example: admin
 *               password:
 *                 type: string
 *                 example: "admin"
 *     responses:
 *       200:
 *         description: Đăng nhập thành công, trả về access token và refresh token
 *       401:
 *         description: Sai tài khoản hoặc mật khẩu
 */
router.post(
	'/login',
	loginLimiter,
	[body('username').notEmpty(), body('password').notEmpty()],
	validate,
	authController.login,
);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Làm mới access token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refresh_token]
 *             properties:
 *               refresh_token:
 *                 type: string
 *                 example: "eyJhbGci..."
 *     responses:
 *       200:
 *         description: Trả về access token mới
 *       401:
 *         description: Refresh token không hợp lệ hoặc đã hết hạn
 */
router.post(
	'/refresh',
	[body('refresh_token').notEmpty()],
	validate,
	authController.refresh,
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Đăng xuất
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Đăng xuất thành công
 */
router.post('/logout', authController.logout);

/**
 * @swagger
 * /auth/logout-all:
 *   post:
 *     summary: Đăng xuất khỏi mọi thiết bị (thu hồi toàn bộ refresh token)
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Đã đăng xuất khỏi mọi thiết bị
 */
router.post('/logout-all', authenticate, authController.logoutAll);

/**
 * @swagger
 * /auth/sessions:
 *   get:
 *     summary: Liệt kê các phiên đăng nhập đang hoạt động của tôi
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Danh sách phiên (mỗi refresh token còn hạn là 1 phiên)
 */
router.get('/sessions', authenticate, authController.sessions);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Đổi mật khẩu
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [old_password, new_password]
 *             properties:
 *               old_password:
 *                 type: string
 *                 example: "oldpass123"
 *               new_password:
 *                 type: string
 *                 minLength: 8
 *                 example: "newpass456"
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công
 *       400:
 *         description: Mật khẩu cũ không đúng hoặc dữ liệu không hợp lệ
 */
router.post(
	'/change-password',
	authenticate,
	[
		body('old_password').notEmpty(),
		body('new_password')
			.isLength({ min: 8 })
			.withMessage('Mật khẩu mới phải có ít nhất 8 ký tự')
			.matches(/[A-Za-z]/)
			.withMessage('Mật khẩu mới phải có ít nhất 1 chữ cái')
			.matches(/[0-9]/)
			.withMessage('Mật khẩu mới phải có ít nhất 1 chữ số'),
	],
	validate,
	authController.changePassword,
);

module.exports = router;
