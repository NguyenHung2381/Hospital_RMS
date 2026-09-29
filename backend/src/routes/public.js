const router = require('express').Router();
// Đếm trên Redis, tự rơi về bộ nhớ khi Redis lỗi (utils/rateLimit.js)
const rateLimit = require('../utils/rateLimit');
const { body, param, query } = require('express-validator');
const { validate } = require('../middlewares/errorHandler');
const ctrl = require('../controllers/publicPortalController');
// Hồ sơ đính kèm (multipart: field `data` = JSON form + `files`) — tùy chọn
const { publicUpload } = require('../middlewares/uploadPublic');

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
		query('full_name').trim().notEmpty().withMessage('Vui lòng nhập họ và tên').isLength({ max: 150 }),
	],
	validate,
	ctrl.lookup,
);

router.post(
	'/course-registration',
	registerLimiter,
	publicUpload,
	[
		body('full_name').trim().notEmpty().withMessage('Họ tên không được để trống'),
		body('course_id').trim().notEmpty().withMessage('Vui lòng chọn khóa học'),
		body('captcha_token').notEmpty().withMessage('Thiếu mã xác nhận'),
		// captcha_answer = nonce proof-of-work (Turnstile không có) — utils/captcha.js tự kiểm tra
		body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email không hợp lệ'),
		body('dob').optional({ checkFalsy: true }).isISO8601(),
		// Có CCCD thì bắt buộc ngày sinh — dùng để đối chiếu với hồ sơ đã có
		body('dob')
			.if(body('national_id').trim().notEmpty())
			.notEmpty()
			.withMessage('Vui lòng nhập ngày sinh kèm số CCCD/CMND'),
		// Loại hồ sơ của từng file đính kèm (cùng thứ tự với `files`)
		body('doc_types').optional().isArray({ max: 10 }),
		body('doc_types.*').isIn(['national_id', 'degree', 'other']).withMessage('Loại hồ sơ không hợp lệ'),
	],
	validate,
	ctrl.register,
);

// ─── Đăng ký đề tài công khai (rút gọn, không cần đăng nhập) ────────────────
router.get('/topic-rounds', ctrl.getOpenTopicRounds);
// Tra đợt theo public_token (link đăng ký gửi cho khoa/phòng) — rate-limit như
// tra cứu theo mã để chặn dò quét token.
router.get(
	'/topic-rounds/by-token/:token',
	codeLookupLimiter,
	[param('token').isString().trim().isLength({ min: 8, max: 255 })],
	validate,
	ctrl.getTopicRoundByToken,
);
router.get('/categories', ctrl.getPublicCategories);
router.get('/departments', ctrl.getPublicDepartments);
router.get('/levels', ctrl.getPublicLevels);

router.post(
	'/topic-registration',
	registerLimiter,
	publicUpload,
	[
		// Chủ nhiệm (người đăng ký) + từng thư ký/thành viên: cùng bộ trường bắt
		// buộc với form "Thêm thành viên thủ công" nội bộ (họ tên, MNV, SĐT, chức danh)
		body('full_name').trim().notEmpty().withMessage('Họ tên không được để trống'),
		body('staff_number').trim().matches(/^\d{1,9}$/).withMessage('Mã nhân viên của chủ nhiệm phải là chữ số'),
		body('phone').trim().notEmpty().withMessage('Vui lòng nhập số điện thoại chủ nhiệm').isLength({ max: 20 }),
		body('position').trim().notEmpty().withMessage('Vui lòng nhập chức danh chuyên môn của chủ nhiệm').isLength({ max: 200 }),
		body('member_department_id').optional({ checkFalsy: true }).isString().isLength({ max: 20 }),
		body('title').trim().notEmpty().withMessage('Vui lòng nhập tiêu đề đề tài'),
		body('round_id').trim().notEmpty().withMessage('Vui lòng chọn đợt đăng ký'),
		body('department_id').trim().notEmpty().withMessage('Vui lòng chọn khoa/phòng'),
		// Cấp độ ăn theo đợt (publicPortalService.registerTopic) — chỉ cần gửi khi đợt có nhiều cấp độ
		body('level_id').optional({ checkFalsy: true }).isString().trim().isLength({ max: 5 }),
		// Mã đề tài sinh theo ký hiệu danh mục (sp_gen_topic_id) ⇒ bắt buộc
		body('category_id').trim().notEmpty().withMessage('Vui lòng chọn danh mục đề tài'),
		body('captcha_token').notEmpty().withMessage('Thiếu mã xác nhận'),
		// captcha_answer = nonce proof-of-work (Turnstile không có) — utils/captcha.js tự kiểm tra
		body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email không hợp lệ'),
		// Thư ký / thành viên ngoài chủ nhiệm (người đăng ký) — tùy chọn
		body('members').optional().isArray({ max: 20 }).withMessage('Tối đa 20 thành viên'),
		body('members.*.full_name').isString().trim().notEmpty().withMessage('Vui lòng nhập họ tên thành viên').isLength({ max: 200 }),
		body('members.*.staff_number').trim().matches(/^\d{1,9}$/).withMessage('Mã nhân viên của thành viên phải là chữ số'),
		body('members.*.phone').isString().trim().notEmpty().withMessage('Vui lòng nhập số điện thoại thành viên').isLength({ max: 20 }),
		body('members.*.position').isString().trim().notEmpty().withMessage('Vui lòng nhập chức danh chuyên môn của thành viên').isLength({ max: 200 }),
		body('members.*.department_id').optional({ checkFalsy: true }).isString().isLength({ max: 20 }),
		body('members.*.role').isIn(['secretary', 'member']).withMessage('Vai trò thành viên không hợp lệ'),
		body('members.*.email').optional({ checkFalsy: true }).isEmail().withMessage('Email thành viên không hợp lệ'),
	],
	validate,
	ctrl.registerTopic,
);

// ─── Tra cứu hồ sơ đề tài theo mã ────────────────────────────────────────────
router.get(
	'/topics/:id/status',
	codeLookupLimiter,
	[
		param('id').isString().isLength({ min: 1, max: 15 }),
		query('contact').isString().trim().isLength({ min: 9, max: 100 }),
	],
	validate,
	ctrl.getTopicStatus,
);

// ─── Thư viện đề tài công khai ───────────────────────────────────────────────
router.get('/featured-topics', ctrl.getFeaturedTopics);

module.exports = router;
