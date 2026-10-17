const router = require('express').Router();
const { body } = require('express-validator');
// Đếm trên Redis, tự rơi về bộ nhớ khi Redis lỗi (utils/rateLimit.js)
const rateLimit = require('../../utils/rateLimit');
const authController = require('./authController');
const passwordResetController = require('./passwordResetController');
const { authenticate } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { checkPassword } = require('../../utils/passwordPolicy');

const loginLimiter = rateLimit({
	name: 'login',
	windowMs: 15 * 60 * 1000, // 15 phút
	limit: 10, // tối đa 10 lần thử đăng nhập / IP / cửa sổ thời gian
	standardHeaders: true,
	legacyHeaders: false,
	// Trả kèm số giây còn lại tới khi cửa sổ reset để client đếm ngược.
	handler: (req, res, next, options) => {
		const resetTime = req.rateLimit?.resetTime;
		const retryAfterSeconds = resetTime
			? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
			: Math.ceil(options.windowMs / 1000);
		res.status(options.statusCode).json({
			success: false,
			message: 'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau ít phút.',
			retry_after_seconds: retryAfterSeconds,
		});
	},
});

// Refresh được gọi tự động (nhiều tab/thiết bị cùng lúc) nên giới hạn rộng hơn
// login — mục tiêu chỉ là chặn spam/dò refresh token, không chặn dùng bình thường.
const refreshLimiter = rateLimit({
	name: 'refresh',
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
	name: 'changePassword',
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
	name: 'twoFaVerify',
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		success: false,
		message: 'Quá nhiều lần nhập sai mã xác thực. Vui lòng thử lại sau ít phút.',
	},
});

// Thiết lập / xác nhận / tắt 2FA — thao tác nhạy cảm trên phiên đã đăng nhập;
// giới hạn để phiên bị chiếm không dò được mã OTP hay mật khẩu (disable) liên tục.
const twoFaManageLimiter = rateLimit({
	name: 'twoFaManage',
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		success: false,
		message: 'Quá nhiều thao tác xác thực 2 lớp. Vui lòng thử lại sau ít phút.',
	},
});

const logoutAllLimiter = rateLimit({
	name: 'logoutAll',
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		success: false,
		message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.',
	},
});

// Quên mật khẩu: giới hạn theo IP để không spam mail / dò OTP 6 số.
const forgotLimiter = rateLimit({
	name: 'forgotPassword',
	windowMs: 15 * 60 * 1000,
	limit: 5,
	standardHeaders: true,
	legacyHeaders: false,
	message: { success: false, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.' },
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
 *               remember_me:
 *                 type: boolean
 *                 description: Ghi nhớ đăng nhập — cookie phiên 30 ngày thay vì cookie tạm
 *     responses:
 *       200:
 *         description: Đăng nhập thành công — access token trong body, refresh token trong cookie HttpOnly rms_rt
 *       401:
 *         description: Sai tài khoản hoặc mật khẩu
 */
router.post(
	'/login',
	loginLimiter,
	// Chặn rẻ trước mọi bước tốn kém: username hoặc email (VARCHAR(100)), mật khẩu
	// tối đa 128 ký tự như passwordPolicy (bcrypt chỉ dùng 72 byte đầu).
	[
		body('username').isString().notEmpty().isLength({ max: 100 }),
		body('password').isString().notEmpty().isLength({ max: 128 }),
		body('pow_token').optional().isString().isLength({ max: 2048 }),
		body('pow_nonce').optional().isString().isLength({ max: 24 }),
	],
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
 *     description: >
 *       Refresh token đọc từ cookie HttpOnly `rms_rt` (đặt lúc đăng nhập). Trường
 *       `refresh_token` trong body chỉ còn để tương thích bản frontend cũ. Trả
 *       `code: REFRESH_RACE` khi tab khác vừa làm mới — client thử lại sau giây lát.
 *     responses:
 *       200:
 *         description: Trả về access token mới
 *       401:
 *         description: Refresh token không hợp lệ hoặc đã hết hạn
 */
router.post(
	'/refresh',
	refreshLimiter,
	// Không bắt buộc body: token nằm trong cookie (utils/authCookie.js)
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
		body('new_password').custom((value, { req }) => {
			const msg = checkPassword(value, { username: req.user?.username });
			if (msg) throw new Error(msg);
			return true;
		}),
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
router.post('/2fa/setup', twoFaManageLimiter, authenticate, authController.setup2FA);

/**
 * @swagger
 * /auth/2fa/verify-setup:
 *   post:
 *     summary: Xác nhận mã đầu tiên sau khi quét QR — chính thức bật 2FA
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: "Đã bật xác thực 2 lớp — trả { backup_codes: string[] } (chỉ hiển thị 1 lần)"
 */
router.post(
	'/2fa/verify-setup',
	twoFaManageLimiter,
	authenticate,
	[body('code').notEmpty()],
	validate,
	authController.verifySetup2FA,
);

/**
 * @swagger
 * /auth/2fa/backup-codes:
 *   post:
 *     summary: Tạo lại bộ mã khôi phục 2FA (bộ cũ mất hiệu lực) — yêu cầu nhập lại mật khẩu
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: "{ backup_codes: string[] } — chỉ hiển thị 1 lần"
 */
router.post(
	'/2fa/backup-codes',
	twoFaManageLimiter,
	authenticate,
	[body('password').notEmpty()],
	validate,
	authController.regenerateBackupCodes,
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
	twoFaManageLimiter,
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

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Gửi OTP đặt lại mật khẩu tới email của tài khoản (luôn trả thành công)
 *     tags: [Auth]
 *     security: []
 */
router.post(
	'/forgot-password',
	forgotLimiter,
	[body('username').isString().notEmpty().isLength({ max: 100 })],
	validate,
	passwordResetController.forgot,
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Đặt mật khẩu mới bằng OTP nhận qua email
 *     tags: [Auth]
 *     security: []
 */
router.post(
	'/reset-password',
	forgotLimiter,
	[
		body('username').isString().notEmpty().isLength({ max: 100 }),
		body('code').isString().matches(/^\d{6}$/).withMessage('Mã OTP gồm 6 chữ số'),
		body('new_password').custom((value, { req }) => {
			const msg = checkPassword(value, { username: req.body?.username });
			if (msg) throw new Error(msg);
			return true;
		}),
	],
	validate,
	passwordResetController.reset,
);

module.exports = router;
