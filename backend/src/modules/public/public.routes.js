const router = require('express').Router();
const { asyncHandler } = require('../../utils/asyncHandler');
// Đếm trên Redis, tự rơi về bộ nhớ khi Redis lỗi (utils/rateLimit.js)
const rateLimit = require('../../utils/rateLimit');
const { body, param, query } = require('express-validator');
const { validate } = require('../../middlewares/errorHandler');
const { formConfigGuard } = require('../forms/formConfigGuard');
const ctrl = require('./publicPortalController');
const regCtrl = require('./publicCourseRegistrationController');
// Nội viện: ô để trống mà hồ sơ nhân viên trong CSDL đã có thì máy chủ tự điền trước khi kiểm
const { fillFromStaffProfile } = require('./publicStaffProfileFill');
const regValidators = require('./courseRegistration.validators');
// Hồ sơ đính kèm đề tài (multipart: field `data` = JSON form + `files`) — tùy chọn
const { publicUpload } = require('../../middlewares/uploadPublic');
// Hồ sơ BẮT BUỘC của đăng ký khóa đào tạo liên tục: mỗi loại 1 phần `files[<kind>]` (gửi đăng ký)
// hoặc 1 phần `file` (nộp / thay theo mã đăng ký) — PDF / JPG / PNG
const {
	registrationFormUpload,
	registrationFileUpload,
} = require('../training/registration/registrationUpload');
const { UPLOADABLE_KINDS } = require('../training/registration/registrationFileKinds');
const uploadPolicy = require('../../utils/uploadPolicy');
const { success } = require('../../utils/response');
const { requireModule } = require('../../middlewares/moduleGuard');

// Công tắc module (MODULE_<KEY>) áp dụng cho từng route thuộc module, không theo mount:
// tắt module thì trả 403 MODULE_DISABLED TRƯỚC captcha, giới hạn tốc độ và multer
// (không lưu hồ sơ đính kèm của module đã tắt). Route dùng chung (captcha, khoa,
// loại học viên, định dạng upload) không gắn công tắc.
const training = requireModule('TRAINING');
const research = requireModule('RESEARCH');
const seminar = requireModule('SEMINAR');

// Cổng công khai không đăng nhập — mọi endpoint ở đây PHẢI được rate-limit
// theo IP, mirror loginLimiter ở modules/auth/auth.routes.js.
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

router.get('/captcha', captchaLimiter, ctrl.getCaptcha);
router.get('/courses', training, ctrl.getOpenCourses);
router.get('/trainee-types', ctrl.getTraineeTypes);
// Định dạng & dung lượng file được nhận (Cấu hình hệ thống) — dùng cho cả trang nội bộ
router.get(
	'/upload-policy',
	asyncHandler(async (_req, res) => {
		return success(res, await uploadPolicy.getPolicy());
	}),
);

// POST (không GET): CCCD + ngày sinh + họ tên đi trong body, không lọt vào URL,
// lịch sử trình duyệt, log proxy hay header Referer.
router.post(
	'/lookup',
	training,
	lookupLimiter,
	[
		body('national_id').trim().notEmpty().withMessage('Vui lòng nhập số CCCD/CMND'),
		// Yếu tố thứ 2: chỉ CCCD thì dò quét được dữ liệu người khác
		body('dob').isISO8601().withMessage('Vui lòng nhập ngày sinh'),
		body('full_name')
			.trim()
			.notEmpty()
			.withMessage('Vui lòng nhập họ và tên')
			.isLength({ max: 150 }),
	],
	validate,
	ctrl.lookup,
);

// ─── Đăng ký khóa đào tạo liên tục (nội viện / ngoại viện) ──────────────────
// Kiểm cứng: courseRegistration.validators.js; bắt buộc theo Cấu hình form 'course_registration'.
const regRulesLimiter = rateLimit({
	name: 'courseRegRules',
	windowMs: 15 * 60 * 1000,
	limit: 120,
	standardHeaders: true,
	legacyHeaders: false,
	message: { success: false, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.' },
});
// Tra nhân viên: mã NV + họ tên (như hội nghị) — chặt hơn hội nghị vì không phải
// cả hội trường dùng chung 1 IP
const regStaffLimiter = rateLimit({
	name: 'courseRegStaff',
	windowMs: 15 * 60 * 1000,
	limit: 20,
	standardHeaders: true,
	legacyHeaders: false,
	message: { success: false, message: 'Quá nhiều lượt tra cứu. Vui lòng thử lại sau ít phút.' },
});
const regOtpLimiter = rateLimit({
	name: 'courseRegOtp',
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: { success: false, message: 'Quá nhiều lần xin mã. Vui lòng thử lại sau ít phút.' },
});
const regOtpVerifyLimiter = rateLimit({
	name: 'courseRegOtpVerify',
	windowMs: 15 * 60 * 1000,
	limit: 20,
	standardHeaders: true,
	legacyHeaders: false,
	message: { success: false, message: 'Quá nhiều lần nhập mã. Vui lòng thử lại sau ít phút.' },
});
// Tra cứu / tải đơn / nộp hồ sơ theo mã đăng ký (kèm CCCD/email) — như tra cứu theo CCCD
const regCodeLimiter = rateLimit({
	name: 'courseRegCode',
	windowMs: 15 * 60 * 1000,
	limit: 20,
	standardHeaders: true,
	legacyHeaders: false,
	message: { success: false, message: 'Quá nhiều lượt tra cứu. Vui lòng thử lại sau ít phút.' },
});
// Đơn / tờ trình nháp của nội viện: sinh .docx tốn CPU ⇒ giới hạn riêng theo IP (ngoài giới hạn theo mã NV)
const regDraftLimiter = rateLimit({
	name: 'courseRegDraft',
	windowMs: 15 * 60 * 1000,
	limit: 30,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		success: false,
		message: 'Quá nhiều lượt tạo giấy tờ. Vui lòng thử lại sau ít phút.',
	},
});
const registrationCode = param('code').isString().isLength({ min: 1, max: 32 });
const registrationFileKind = param('kind')
	.isIn(UPLOADABLE_KINDS)
	.withMessage('Loại hồ sơ không hợp lệ');

router.get('/course-registration/rules', training, regRulesLimiter, regCtrl.getRules);
router.post(
	'/course-registration/staff-check',
	training,
	regStaffLimiter,
	regValidators.staffCheck,
	validate,
	regCtrl.staffCheck,
);
router.post(
	'/course-registration/email-otp',
	training,
	regOtpLimiter,
	regValidators.emailOtpRequest,
	validate,
	regCtrl.requestEmailOtp,
);
router.post(
	'/course-registration/email-otp/verify',
	training,
	regOtpVerifyLimiter,
	regValidators.emailOtpVerify,
	validate,
	regCtrl.verifyEmailOtp,
);
router.post(
	'/course-registration',
	training,
	registerLimiter,
	registrationFormUpload,
	fillFromStaffProfile(),
	regValidators.registration,
	validate,
	formConfigGuard('course_registration', { variant: 'public', mode: 'create' }),
	ctrl.register,
);
// Khai báo TRƯỚC các route /course-registration/:code/... — nếu không, /:code/application bắt mất "draft"
router.post(
	'/course-registration/draft/application',
	training,
	regDraftLimiter,
	fillFromStaffProfile({ draft: 'application' }),
	regValidators.draftApplication,
	validate,
	regCtrl.draftApplication,
);
router.post(
	'/course-registration/draft/proposal',
	training,
	regDraftLimiter,
	fillFromStaffProfile({ draft: 'proposal' }),
	regValidators.draftProposal,
	validate,
	regCtrl.draftProposal,
);
router.post(
	'/course-registration/:code/status',
	training,
	regCodeLimiter,
	[registrationCode, ...regValidators.secondFactor],
	validate,
	regCtrl.getStatus,
);
router.post(
	'/course-registration/:code/application',
	training,
	regCodeLimiter,
	[registrationCode, ...regValidators.secondFactor],
	validate,
	regCtrl.downloadApplication,
);
router.post(
	'/course-registration/:code/details',
	training,
	regCodeLimiter,
	[registrationCode, ...regValidators.secondFactor],
	validate,
	regCtrl.getEditable,
);
router.post(
	'/course-registration/:code/amend',
	training,
	regCodeLimiter,
	[registrationCode, ...regValidators.amendment],
	validate,
	formConfigGuard('course_registration', { variant: 'public', mode: 'create' }),
	regCtrl.amend,
);
router.post(
	'/course-registration/:code/files/:kind',
	training,
	regCodeLimiter,
	[registrationCode, registrationFileKind],
	validate,
	registrationFileUpload,
	regValidators.secondFactor,
	validate,
	regCtrl.uploadFile,
);

// ─── Đăng ký đề tài công khai (rút gọn, không cần đăng nhập) ────────────────
router.get('/topic-rounds', research, ctrl.getOpenTopicRounds);
// Tra đợt theo public_token (link đăng ký gửi cho khoa/phòng) — rate-limit như
// tra cứu theo mã để chặn dò quét token.
router.get(
	'/topic-rounds/by-token/:token',
	research,
	codeLookupLimiter,
	[param('token').isString().trim().isLength({ min: 8, max: 255 })],
	validate,
	ctrl.getTopicRoundByToken,
);
router.get('/categories', research, ctrl.getPublicCategories);
router.get('/departments', ctrl.getPublicDepartments);
router.get('/levels', research, ctrl.getPublicLevels);

router.post(
	'/topic-registration',
	research,
	registerLimiter,
	publicUpload,
	[
		// Chủ nhiệm (người đăng ký) + từng thư ký/thành viên: cùng bộ trường bắt
		// buộc với form "Thêm thành viên thủ công" nội bộ (họ tên, MNV, SĐT, chức danh)
		body('full_name').trim().notEmpty().withMessage('Họ tên không được để trống'),
		body('staff_number')
			.trim()
			.matches(/^\d{1,9}$/)
			.withMessage('Mã nhân viên của chủ nhiệm phải là chữ số'),
		// SĐT / chức danh: bắt buộc hay không do Cấu hình form quyết định (formConfigGuard)
		body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 20 }),
		body('position').optional({ checkFalsy: true }).trim().isLength({ max: 200 }),
		body('member_department_id').optional({ checkFalsy: true }).isString().isLength({ max: 20 }),
		body('title').trim().notEmpty().withMessage('Vui lòng nhập tiêu đề đề tài'),
		body('round_id').trim().notEmpty().withMessage('Vui lòng chọn đợt đăng ký'),
		body('department_id').trim().notEmpty().withMessage('Vui lòng chọn khoa/phòng'),
		// Mã đề tài sinh theo ký hiệu danh mục (genTopicId) ⇒ bắt buộc
		body('category_id').trim().notEmpty().withMessage('Vui lòng chọn danh mục đề tài'),
		body('captcha_token').notEmpty().withMessage('Thiếu mã xác nhận'),
		// captcha_answer = nonce proof-of-work (Turnstile không có) — utils/captcha.js tự kiểm tra
		body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email không hợp lệ'),
		// Thư ký / thành viên ngoài chủ nhiệm (người đăng ký) — tùy chọn
		body('members').optional().isArray({ max: 20 }).withMessage('Tối đa 20 thành viên'),
		body('members.*.full_name')
			.isString()
			.trim()
			.notEmpty()
			.withMessage('Vui lòng nhập họ tên thành viên')
			.isLength({ max: 200 }),
		body('members.*.staff_number')
			.trim()
			.matches(/^\d{1,9}$/)
			.withMessage('Mã nhân viên của thành viên phải là chữ số'),
		body('members.*.phone')
			.isString()
			.trim()
			.notEmpty()
			.withMessage('Vui lòng nhập số điện thoại thành viên')
			.isLength({ max: 20 }),
		body('members.*.position')
			.isString()
			.trim()
			.notEmpty()
			.withMessage('Vui lòng nhập chức danh chuyên môn của thành viên')
			.isLength({ max: 200 }),
		body('members.*.department_id').optional({ checkFalsy: true }).isString().isLength({ max: 20 }),
		body('members.*.role')
			.isIn(['secretary', 'member'])
			.withMessage('Vai trò thành viên không hợp lệ'),
		body('members.*.email')
			.optional({ checkFalsy: true })
			.isEmail()
			.withMessage('Email thành viên không hợp lệ'),
	],
	validate,
	formConfigGuard('topic', { variant: 'public', mode: 'create' }),
	ctrl.registerTopic,
);

// ─── Tra cứu hồ sơ đề tài theo mã ────────────────────────────────────────────
router.get(
	'/topics/:id/status',
	research,
	codeLookupLimiter,
	[
		param('id').isString().isLength({ min: 1, max: 15 }),
		query('contact').isString().trim().isLength({ min: 9, max: 100 }),
	],
	validate,
	ctrl.getTopicStatus,
);

// ─── Hội nghị: đăng ký qua QR, vé QR, bài test cuối buổi ───────────────────
// Người tham dự thường dùng chung wifi hội trường (cùng IP) — giới hạn nới hơn
// các form khác. Mã token/vé là 128-bit ngẫu nhiên nên không lo dò quét.
const seminarLimiter = rateLimit({
	name: 'seminar',
	windowMs: 15 * 60 * 1000,
	limit: 2000,
	standardHeaders: true,
	legacyHeaders: false,
	message: { success: false, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.' },
});
// Tra lại vé bằng họ tên + ngày sinh: chỉ đếm lượt tra SAI (người cả hội trường chung IP
// tra đúng không bị chặn) — đủ để không dò ngày sinh của một cái tên.
const seminarTicketLookupLimiter = rateLimit({
	name: 'seminar-ticket-lookup',
	windowMs: 15 * 60 * 1000,
	limit: 20,
	skipSuccessfulRequests: true,
	standardHeaders: true,
	legacyHeaders: false,
	message: { success: false, message: 'Tra cứu sai quá nhiều lần. Vui lòng thử lại sau ít phút.' },
});
const seminarToken = param('token')
	.isString()
	.matches(/^[a-f0-9]{32}$/)
	.withMessage('Link đăng ký không đúng');
const ticketCode = param('code')
	.isString()
	.matches(/^[a-f0-9]{32}$/)
	.withMessage('Mã vé không đúng');
const seminarTestId = param('testId')
	.isString()
	.matches(/^[A-Za-z0-9]{1,20}$/)
	.withMessage('Mã đề kiểm tra không đúng');

router.get('/seminars/:token', seminar, seminarLimiter, [seminarToken], validate, ctrl.getSeminar);
router.post(
	'/seminars/:token/staff-lookup',
	seminar,
	seminarLimiter,
	[
		seminarToken,
		body('full_name').trim().notEmpty().withMessage('Vui lòng nhập họ tên').isLength({ max: 255 }),
		body('staff_number').isInt({ min: 1 }).withMessage('Mã nhân viên không hợp lệ'),
	],
	validate,
	ctrl.lookupSeminarStaff,
);
// Mất mã QR: quét lại QR đăng ký — nội viện: họ tên + mã NV, ngoại viện: họ tên + ngày sinh (có captcha) ⇒ mã vé
router.post(
	'/seminars/:token/ticket-lookup',
	seminar,
	seminarLimiter,
	seminarTicketLookupLimiter,
	[
		seminarToken,
		body('full_name').trim().notEmpty().withMessage('Vui lòng nhập họ tên').isLength({ max: 255 }),
		body('source')
			.isIn(['internal', 'external'])
			.withMessage('Vui lòng chọn nội viện / ngoại viện'),
		body('staff_number')
			.if(body('source').equals('internal'))
			.isInt({ min: 1 })
			.withMessage('Vui lòng nhập mã nhân viên'),
		body('dob')
			.if(body('source').equals('external'))
			.isISO8601({ strict: true })
			.withMessage('Ngày sinh không hợp lệ'),
		body('captcha_token').notEmpty().withMessage('Thiếu mã xác nhận'),
	],
	validate,
	ctrl.lookupSeminarTicket,
);
router.post(
	'/seminars/:token/register',
	seminar,
	seminarLimiter,
	[
		seminarToken,
		body('full_name')
			.trim()
			.notEmpty()
			.withMessage('Họ tên không được để trống')
			.isLength({ max: 255 }),
		// Nội viện chỉ cần họ tên + mã NV — còn lại backend lấy từ hồ sơ nhân sự
		body('staff_number')
			.if(body('source').equals('internal'))
			.isInt({ min: 1 })
			.withMessage('Vui lòng nhập mã nhân viên'),
		body('phone')
			.if(body('source').equals('external'))
			.trim()
			.matches(/^[0-9+ .-]{8,20}$/)
			.withMessage('Số điện thoại không hợp lệ'),
		body('email')
			.optional({ checkFalsy: true })
			.trim()
			.isEmail()
			.withMessage('Email không hợp lệ')
			.isLength({ max: 255 }),
		body('dob').optional({ checkFalsy: true }).isISO8601().withMessage('Ngày sinh không hợp lệ'),
		// Bắt buộc hay không theo Cấu hình form (formConfigGuard bên dưới)
		body('organization').optional({ checkFalsy: true }).trim().isLength({ max: 255 }),
		body('department_raw').optional().isString().isLength({ max: 255 }),
		body('qualification_raw').optional().isString().isLength({ max: 100 }),
		body('title_prefix').optional().isString().isLength({ max: 10 }),
		body('source')
			.isIn(['internal', 'external'])
			.withMessage('Vui lòng chọn nội viện / ngoại viện'),
		body('captcha_token').notEmpty().withMessage('Thiếu mã xác nhận'),
	],
	validate,
	formConfigGuard('seminar_participant', { variant: 'public', mode: 'create' }),
	ctrl.registerSeminar,
);
router.get(
	'/seminar-tickets/:code',
	seminar,
	seminarLimiter,
	[ticketCode],
	validate,
	ctrl.getSeminarTicket,
);
// Sự kiện lịch (.ics) của vé — mở bằng link thường để điện thoại hiện "Thêm vào Lịch"
router.get(
	'/seminar-tickets/:code/calendar',
	seminar,
	seminarLimiter,
	[ticketCode],
	validate,
	ctrl.getSeminarTicketCalendar,
);
// Ảnh thẻ đại biểu (PNG, tải về máy) — cho trình duyệt trong Zalo/Facebook không tải được blob
router.get(
	'/seminar-tickets/:code/qr.png',
	seminar,
	seminarLimiter,
	[ticketCode],
	validate,
	ctrl.getSeminarTicketBadge,
);
router.post(
	'/seminar-tickets/:code/tests/:testId/start',
	seminar,
	seminarLimiter,
	[ticketCode, seminarTestId],
	validate,
	ctrl.startSeminarTest,
);
router.post(
	'/seminar-tickets/:code/tests/:testId',
	seminar,
	seminarLimiter,
	[ticketCode, seminarTestId, body('answers').isArray({ max: 200 })],
	validate,
	ctrl.submitSeminarTest,
);

// QR chung của 1 đề kiểm tra (seminarTestQrService): quét → nhập họ tên → làm bài
const testQrToken = param('token')
	.isString()
	.matches(/^[a-f0-9]{32}$/)
	.withMessage('Link bài kiểm tra không đúng');
const attemptCode = param('code')
	.isString()
	.matches(/^[a-f0-9]{32}$/)
	.withMessage('Mã lượt làm bài không đúng');
router.get(
	'/seminar-test-qr/:token',
	seminar,
	seminarLimiter,
	[testQrToken],
	validate,
	ctrl.getSeminarTestQr,
);
router.post(
	'/seminar-test-qr/:token/enter',
	seminar,
	seminarLimiter,
	[
		testQrToken,
		body('full_name').trim().notEmpty().withMessage('Vui lòng nhập họ tên').isLength({ max: 255 }),
		body('organization').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
		body('participant_id')
			.optional({ nullable: true, checkFalsy: true })
			.isString()
			.matches(/^[A-Za-z0-9]{1,24}$/)
			.withMessage('Lựa chọn không hợp lệ'),
		body('as_guest').optional().isBoolean(),
	],
	validate,
	ctrl.enterSeminarTestQr,
);
router.get(
	'/seminar-test-attempts/:code',
	seminar,
	seminarLimiter,
	[attemptCode],
	validate,
	ctrl.getSeminarTestAttempt,
);
router.post(
	'/seminar-test-attempts/:code/start',
	seminar,
	seminarLimiter,
	[attemptCode],
	validate,
	ctrl.startSeminarTestAttempt,
);
router.post(
	'/seminar-test-attempts/:code',
	seminar,
	seminarLimiter,
	[attemptCode, body('answers').isArray({ max: 200 })],
	validate,
	ctrl.submitSeminarTestAttempt,
);

// ─── Thư viện đề tài công khai ───────────────────────────────────────────────
router.get('/featured-topics', research, ctrl.getFeaturedTopics);

module.exports = router;
