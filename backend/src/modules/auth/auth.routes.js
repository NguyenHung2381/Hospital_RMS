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

router.post(
	'/refresh',
	refreshLimiter,
	// Không bắt buộc body: token nằm trong cookie (utils/authCookie.js)
	authController.refresh,
);

router.post('/logout', authController.logout);

router.post('/logout-all', logoutAllLimiter, authenticate, authController.logoutAll);

router.get('/sessions', authenticate, authController.sessions);

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

router.post(
	'/2fa/verify',
	twoFaVerifyLimiter,
	[body('pre_auth_token').notEmpty(), body('code').notEmpty()],
	validate,
	authController.verify2FA,
);

router.post('/2fa/setup', twoFaManageLimiter, authenticate, authController.setup2FA);

router.post(
	'/2fa/verify-setup',
	twoFaManageLimiter,
	authenticate,
	[body('code').notEmpty()],
	validate,
	authController.verifySetup2FA,
);

router.post(
	'/2fa/backup-codes',
	twoFaManageLimiter,
	authenticate,
	[body('password').notEmpty()],
	validate,
	authController.regenerateBackupCodes,
);

router.post(
	'/2fa/disable',
	twoFaManageLimiter,
	authenticate,
	[body('password').notEmpty()],
	validate,
	authController.disable2FA,
);

router.get('/2fa/status', authenticate, authController.status2FA);

router.post(
	'/forgot-password',
	forgotLimiter,
	[body('username').isString().notEmpty().isLength({ max: 100 })],
	validate,
	passwordResetController.forgot,
);

router.post(
	'/reset-password',
	forgotLimiter,
	[
		body('username').isString().notEmpty().isLength({ max: 100 }),
		body('code')
			.isString()
			.matches(/^\d{6}$/)
			.withMessage('Mã OTP gồm 6 chữ số'),
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
