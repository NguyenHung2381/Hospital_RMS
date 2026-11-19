// Kiểm cứng cho form đăng ký khóa đào tạo liên tục (cổng công khai). Bắt buộc hay không
// của trường KHÔNG khóa do Cấu hình form quyết định (formConfigGuard chạy sau); ở đây giữ
// những gì admin không được nới: kiểu dữ liệu, độ dài cột, đối tượng hợp lệ, 2 cam kết
// phải là true, cấu trúc CCCD khớp giới tính / năm sinh, mã NV của nội viện.
const { body } = require('express-validator');
const { checkNationalId, NATIONAL_ID_ISSUE_MESSAGE } = require('../../utils/nationalId');
const { SOURCES } = require('../training/registration/registrationConstants');

// Độ dài tối đa = độ dài cột (contract mục 3)
const TEXT_MAX = {
	ethnicity: 50,
	hometown: 255,
	national_id_issued_place: 200,
	permanent_address: 255,
	address: 255,
	phone: 20,
	qualification: 150,
	graduated_school: 200,
	graduated_major: 200,
	degree_number: 50,
	degree_registry_number: 50,
	workplace: 200,
	work_specialty: 200,
	work_seniority: 100,
	trainee_type_id: 20,
	department_id: 20,
	invoice_org_name: 255,
	invoice_org_address: 255,
	invoice_tax_code: 20,
	invoice_budget_code: 20,
};

const isTrue = (v) => v === true || v === 'true';

const optionalText = (key, max) =>
	body(key)
		.optional({ values: 'falsy' })
		.isString()
		.withMessage('Dữ liệu không hợp lệ')
		.trim()
		.isLength({ max })
		.withMessage(`Tối đa ${max} ký tự`);

const staffNumber = (when) =>
	body('staff_number')
		.if(when)
		.trim()
		.matches(/^\d{1,9}$/)
		.withMessage('Mã nhân viên phải gồm 1–9 chữ số');

const internalOnly = body('source').equals('internal');

const nationalIdRule = body('national_id')
	.optional({ values: 'falsy' })
	.isString()
	.withMessage('Số CCCD không hợp lệ')
	.trim()
	.custom((value, { req }) => {
		const r = checkNationalId(value, { dob: req.body.dob, gender: req.body.gender });
		if (!r.valid) throw new Error(NATIONAL_ID_ISSUE_MESSAGE[r.issues[0]]);
		return true;
	});

// Đăng ký (POST /public/course-registration) — body = JSON trong field `data` (multipart)
const registration = [
	body('source').isIn(SOURCES).withMessage('Vui lòng chọn nội viện / ngoại viện'),
	body('full_name')
		.isString()
		.trim()
		.notEmpty()
		.withMessage('Họ tên không được để trống')
		.isLength({ max: 150 })
		.withMessage('Họ tên tối đa 150 ký tự'),
	body('course_id')
		.isString()
		.trim()
		.notEmpty()
		.withMessage('Vui lòng chọn khóa học')
		.isLength({ max: 20 }),
	body('program_id').optional({ values: 'falsy' }).isString().isLength({ max: 20 }),
	body('captcha_token').notEmpty().withMessage('Thiếu mã xác nhận'),
	// captcha_answer = nonce proof-of-work (Turnstile không có) — utils/captcha.js tự kiểm tra
	body('rules_accepted').custom(isTrue).withMessage('Vui lòng cam kết thực hiện nội quy lớp học'),
	body('declared_true')
		.custom(isTrue)
		.withMessage('Vui lòng cam kết thông tin đã khai là đúng sự thật'),
	body('email')
		.optional({ values: 'falsy' })
		.isString()
		.trim()
		.isEmail()
		.withMessage('Email không hợp lệ')
		.isLength({ max: 100 }),
	body('invoice_email')
		.optional({ values: 'falsy' })
		.isString()
		.trim()
		.isEmail()
		.withMessage('Email nhận hóa đơn không hợp lệ')
		.isLength({ max: 100 }),
	body('dob').optional({ values: 'falsy' }).isISO8601().withMessage('Ngày sinh không hợp lệ'),
	// Có CCCD thì bắt buộc ngày sinh — đối chiếu cấu trúc CCCD và hồ sơ đã có
	body('dob')
		.if(body('national_id').trim().notEmpty())
		.notEmpty()
		.withMessage('Vui lòng nhập ngày sinh kèm số CCCD/CMND'),
	body('national_id_issued_date')
		.optional({ values: 'falsy' })
		.isISO8601()
		.withMessage('Ngày cấp CCCD không hợp lệ'),
	body('gender')
		.optional({ values: 'falsy' })
		.isIn(['male', 'female', 'other'])
		.withMessage('Giới tính không hợp lệ'),
	body('graduated_year')
		.optional({ values: 'falsy' })
		.isInt({ min: 1900, max: 2100 })
		.withMessage('Năm tốt nghiệp không hợp lệ'),
	nationalIdRule,
	...Object.entries(TEXT_MAX).map(([k, max]) => optionalText(k, max)),
	staffNumber(internalOnly),
	body('email_token').optional({ values: 'falsy' }).isString().isLength({ max: 2000 }),
];

const staffCheck = [
	staffNumber(() => true),
	body('full_name')
		.isString()
		.trim()
		.notEmpty()
		.withMessage('Vui lòng nhập họ tên')
		.isLength({ max: 150 }),
];

const emailOtpRequest = [
	body('source').isIn(SOURCES).withMessage('Vui lòng chọn nội viện / ngoại viện'),
	body('email')
		.isString()
		.trim()
		.isEmail()
		.withMessage('Email không hợp lệ')
		.isLength({ max: 100 }),
	staffNumber(internalOnly),
	body('full_name')
		.if(internalOnly)
		.isString()
		.trim()
		.notEmpty()
		.withMessage('Vui lòng nhập họ tên')
		.isLength({ max: 150 }),
	body('captcha_token').notEmpty().withMessage('Thiếu mã xác nhận'),
];

const emailOtpVerify = [
	body('challenge_id')
		.isString()
		.matches(/^[a-f0-9]{32}$/)
		.withMessage('Mã xác minh không đúng hoặc đã hết hạn. Vui lòng xin mã mới.'),
	body('code')
		.isString()
		.trim()
		.matches(/^\d{6}$/)
		.withMessage('Mã xác minh gồm 6 chữ số'),
];

// Yếu tố thứ hai khi tra cứu / tải đơn / nộp hồ sơ theo mã đăng ký
const secondFactor = [
	body('national_id').optional({ values: 'falsy' }).isString().trim().isLength({ max: 20 }),
	body('email').optional({ values: 'falsy' }).isString().trim().isLength({ max: 100 }),
	body('download_token').optional({ values: 'falsy' }).isString().isLength({ max: 2000 }),
	body().custom((b) => {
		if (!b?.national_id && !b?.email && !b?.download_token)
			throw new Error('Vui lòng nhập số CCCD hoặc email đã khai khi đăng ký');
		return true;
	}),
];

module.exports = { registration, staffCheck, emailOtpRequest, emailOtpVerify, secondFactor };
