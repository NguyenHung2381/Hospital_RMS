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

// Refresh được gọi tự động (nhiều tab/thiết bị cùng lúc) nên giới hạn rộng hơn
// login — mục tiêu chỉ là chặn spam/dò refresh token, không chặn dùng bình thường.
const refreshLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 30,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		success: false,
		message: 'Quá nhiều yêu cầu làm mới token. Vui lòng thử lại sau ít phút.',
	},
});

const changePasswordLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 5,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		success: false,
		message: 'Quá nhiều lần đổi mật khẩu. Vui lòng thử lại sau ít phút.',
	},
});

// Xác minh mã OTP là bước cuối cùng của đăng nhập — chặn dò mã 6 số tương tự
// loginLimiter, tách riêng vì đây là 1 route khác (/auth/2fa/verify).
const twoFaVerifyLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		success: false,
		message: 'Quá nhiều lần nhập sai mã xác thực. Vui lòng thử lại sau ít phút.',
	},
});

const logoutAllLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		success: false,
		message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.',
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
	refreshLimiter,
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
router.post('/logout-all', logoutAllLimiter, authenticate, authController.logoutAll);

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
	changePasswordLimiter,
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

/**
 * @swagger
 * /auth/2fa/verify:
 *   post:
 *     summary: Xác minh mã OTP (bước 2 của đăng nhập cho tài khoản đã bật 2FA)
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       200:
 *         description: Đăng nhập thành công, trả về access/refresh token
 *       401:
 *         description: Mã không đúng hoặc pre_auth_token hết hạn
 */
router.post(
	'/2fa/verify',
	twoFaVerifyLimiter,
	[body('pre_auth_token').notEmpty(), body('code').notEmpty()],
	validate,
	authController.verify2FA,
);

/**
 * @swagger
 * /auth/2fa/setup:
 *   post:
 *     summary: Khởi tạo thiết lập 2FA — sinh secret + otpauth URI để quét QR
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Trả về secret và otpauth_uri (chưa bật, chờ xác nhận mã đầu tiên)
 */
router.post('/2fa/setup', authenticate, authController.setup2FA);

/**
 * @swagger
 * /auth/2fa/verify-setup:
 *   post:
 *     summary: Xác nhận mã đầu tiên sau khi quét QR — chính thức bật 2FA
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Đã bật xác thực 2 lớp
 */
router.post(
	'/2fa/verify-setup',
	authenticate,
	[body('code').notEmpty()],
	validate,
	authController.verifySetup2FA,
);

/**
 * @swagger
 * /auth/2fa/disable:
 *   post:
 *     summary: Tắt xác thực 2 lớp (yêu cầu nhập lại mật khẩu)
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Đã tắt xác thực 2 lớp
 */
router.post(
	'/2fa/disable',
	authenticate,
	[body('password').notEmpty()],
	validate,
	authController.disable2FA,
);

/**
 * @swagger
 * /auth/2fa/status:
 *   get:
 *     summary: Trạng thái 2FA của tài khoản hiện tại
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: "{ enabled: boolean }"
 */
router.get('/2fa/status', authenticate, authController.status2FA);

module.exports = router;
