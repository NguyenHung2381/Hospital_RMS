const router = require('express').Router();
// Đếm trên Redis, tự rơi về bộ nhớ khi Redis lỗi (utils/rateLimit.js)
const rateLimit = require('../utils/rateLimit');
const { body, query } = require('express-validator');
const { validate } = require('../middlewares/errorHandler');
const ctrl = require('../controllers/publicPortalController');

// Cổng công khai không đăng nhập — mọi endpoint ở đây PHẢI được rate-limit
// theo IP, mirror loginLimiter ở routes/auth.js.
const registerLimiter = rateLimit({
	name: 'register',
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: { success: false, message: 'Quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau ít phút.' },
});

// Tra cứu theo CCCD bị giới hạn chặt hơn đăng ký — hạn chế dò quét CCCD hàng loạt.
const lookupLimiter = rateLimit({
	name: 'lookup',
	windowMs: 15 * 60 * 1000,
	limit: 8,
	standardHeaders: true,
	legacyHeaders: false,
	message: { success: false, message: 'Quá nhiều lượt tra cứu. Vui lòng thử lại sau ít phút.' },
});

const captchaLimiter = rateLimit({
	name: 'captcha',
	windowMs: 15 * 60 * 1000,
	limit: 30,
	standardHeaders: true,
	legacyHeaders: false,
	message: { success: false, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.' },
});

// Tra cứu hồ sơ theo mã — nới hơn lookupLimiter (CCCD) vì mã ở đây (topic id)
// không phải dữ liệu cá nhân, chỉ giới hạn để chặn dò quét.
const codeLookupLimiter = rateLimit({
	name: 'codeLookup',
	windowMs: 15 * 60 * 1000,
	limit: 20,
	standardHeaders: true,
	legacyHeaders: false,
	message: { success: false, message: 'Quá nhiều lượt tra cứu. Vui lòng thử lại sau ít phút.' },
});

/**
 * @swagger
 * tags:
 *   name: Public
 *   description: Cổng công khai (đăng ký khóa học, tra cứu kết quả) — không cần đăng nhập
 */

router.get('/captcha', captchaLimiter, ctrl.getCaptcha);
router.get('/courses', ctrl.getOpenCourses);
router.get('/trainee-types', ctrl.getTraineeTypes);

router.get(
	'/lookup',
	lookupLimiter,
	[
		query('national_id').trim().notEmpty().withMessage('Vui lòng nhập số CCCD/CMND'),
		// Yếu tố thứ 2: chỉ CCCD thì dò quét được dữ liệu người khác
		query('dob').isISO8601().withMessage('Vui lòng nhập ngày sinh'),
	],
	validate,
	ctrl.lookup,
);

router.post(
	'/course-registration',
	registerLimiter,
	[
		body('full_name').trim().notEmpty().withMessage('Họ tên không được để trống'),
		body('course_id').trim().notEmpty().withMessage('Vui lòng chọn khóa học'),
		body('captcha_token').notEmpty().withMessage('Thiếu mã xác nhận'),
		// captcha_answer chỉ có ở chế độ phép tính (Turnstile không có) — utils/captcha.js tự kiểm tra
		body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email không hợp lệ'),
		body('dob').optional({ checkFalsy: true }).isISO8601(),
		// Có CCCD thì bắt buộc ngày sinh — dùng để đối chiếu với hồ sơ đã có
		body('dob')
			.if(body('national_id').trim().notEmpty())
			.notEmpty()
			.withMessage('Vui lòng nhập ngày sinh kèm số CCCD/CMND'),
	],
	validate,
	ctrl.register,
);

// ─── Đăng ký đề tài công khai (rút gọn, không cần đăng nhập) ────────────────
router.get('/topic-rounds', ctrl.getOpenTopicRounds);
router.get('/categories', ctrl.getPublicCategories);
router.get('/departments', ctrl.getPublicDepartments);
router.get('/levels', ctrl.getPublicLevels);

router.post(
	'/topic-registration',
	registerLimiter,
	[
		body('full_name').trim().notEmpty().withMessage('Họ tên không được để trống'),
		body('title').trim().notEmpty().withMessage('Vui lòng nhập tiêu đề đề tài'),
		body('round_id').trim().notEmpty().withMessage('Vui lòng chọn đợt đăng ký'),
		body('department_id').trim().notEmpty().withMessage('Vui lòng chọn khoa/phòng'),
		body('level_id').trim().notEmpty().withMessage('Vui lòng chọn cấp độ đề tài'),
		body('captcha_token').notEmpty().withMessage('Thiếu mã xác nhận'),
		// captcha_answer chỉ có ở chế độ phép tính (Turnstile không có) — utils/captcha.js tự kiểm tra
		body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email không hợp lệ'),
	],
	validate,
	ctrl.registerTopic,
);

// ─── Tra cứu hồ sơ đề tài theo mã ────────────────────────────────────────────
router.get('/topics/:id/status', codeLookupLimiter, ctrl.getTopicStatus);

// ─── Thư viện đề tài công khai ───────────────────────────────────────────────
router.get('/featured-topics', ctrl.getFeaturedTopics);

module.exports = router;
