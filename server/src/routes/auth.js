const router = require('express').Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');

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
 *                 minLength: 6
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
	[body('old_password').notEmpty(), body('new_password').isLength({ min: 6 })],
	validate,
	authController.changePassword,
);

module.exports = router;
