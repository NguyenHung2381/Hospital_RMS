// Kiểm cứng cho form đăng ký khóa đào tạo liên tục (cổng công khai). Bắt buộc hay không
// của trường KHÔNG khóa do Cấu hình form quyết định (formConfigGuard chạy sau); ở đây giữ
// những gì admin không được nới: kiểu dữ liệu, độ dài cột, đối tượng hợp lệ, 3 cam kết
// phải là true + họ tên ký khớp họ tên khai, cấu trúc CCCD khớp giới tính / năm sinh, mã NV của nội viện.
const { body } = require('express-validator');
const { checkNationalId, NATIONAL_ID_ISSUE_MESSAGE } = require('../../utils/nationalId');
const { SOURCES } = require('../training/registration/registrationConstants');
const { signatureMatches } = require('../training/registration/registrationConsent');

// Độ dài tối đa = độ dài cột (form 'course_registration' ở formRegistry.js)
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

// Luật kiểu dữ liệu dùng chung cho đăng ký và đơn nháp
const fullNameRule = body('full_name')
	.isString()
	.trim()
	.notEmpty()
	.withMessage('Họ tên không được để trống')
	.isLength({ max: 150 })
	.withMessage('Họ tên tối đa 150 ký tự');
const courseIdRule = body('course_id')
	.isString()
	.trim()
	.notEmpty()
	.withMessage('Vui lòng chọn khóa học')
	.isLength({ max: 20 });
const programIdRule = body('program_id')
	.optional({ values: 'falsy' })
	.isString()
	.isLength({ max: 20 });
const emailRule = body('email')
	.optional({ values: 'falsy' })
	.isString()
	.trim()
	.isEmail()
	.withMessage('Email không hợp lệ')
	.isLength({ max: 100 });
const dobRule = body('dob')
	.optional({ values: 'falsy' })
	.isISO8601()
	.withMessage('Ngày sinh không hợp lệ');
const issuedDateRule = body('national_id_issued_date')
	.optional({ values: 'falsy' })
	.isISO8601()
	.withMessage('Ngày cấp CCCD không hợp lệ');
const genderRule = body('gender')
	.optional({ values: 'falsy' })
	.isIn(['male', 'female', 'other'])
	.withMessage('Giới tính không hợp lệ');
const graduatedYearRule = body('graduated_year')
	.optional({ values: 'falsy' })
	.isInt({ min: 1900, max: 2100 })
	.withMessage('Năm tốt nghiệp không hợp lệ');
const isInvoiceKey = (k) => k.startsWith('invoice_');
const textRules = (include) =>
	Object.entries(TEXT_MAX)
		.filter(([k]) => include(k))
		.map(([k, max]) => optionalText(k, max));

const invoiceEmailRule = body('invoice_email')
	.optional({ values: 'falsy' })
	.isString()
	.trim()
	.isEmail()
	.withMessage('Email nhận hóa đơn không hợp lệ')
	.isLength({ max: 100 });
// Có CCCD thì bắt buộc ngày sinh — đối chiếu cấu trúc CCCD và hồ sơ đã có
const dobWithIdRule = body('dob')
	.if(body('national_id').trim().notEmpty())
	.notEmpty()
	.withMessage('Vui lòng nhập ngày sinh kèm số CCCD/CMND');
// Kiểu dữ liệu các trường thông tin học viên + hóa đơn — dùng chung cho đăng ký và sửa bản khai
const infoRules = () => [
	emailRule,
	invoiceEmailRule,
	dobRule,
	dobWithIdRule,
	issuedDateRule,
	genderRule,
	graduatedYearRule,
	nationalIdRule,
	...textRules(() => true),
];
const commitmentRules = () => [
	body('declared_true')
		.custom(isTrue)
		.withMessage('Vui lòng cam kết thông tin đã khai là đúng sự thật'),
	body('data_consent')
		.custom(isTrue)
		.withMessage('Vui lòng đồng ý cho Bệnh viện xử lý dữ liệu cá nhân để xét duyệt đăng ký'),
	// Ký điện tử: gõ lại đúng họ tên đã khai (nội viện: họ tên trong hồ sơ nhân sự — FE điền sẵn)
	body('signature_name')
		.isString()
		.withMessage('Vui lòng gõ họ và tên để ký xác nhận')
		.bail()
		.isLength({ max: 150 })
		.custom((v, { req }) => signatureMatches(v, req.body.full_name))
		.withMessage('Họ tên ký xác nhận phải trùng với họ tên đã khai'),
];

// Đăng ký (POST /public/course-registration) — body = JSON trong field `data` (multipart)
const registration = [
	body('source').isIn(SOURCES).withMessage('Vui lòng chọn nội viện / ngoại viện'),
	fullNameRule,
	courseIdRule,
	programIdRule,
	body('captcha_token').notEmpty().withMessage('Thiếu mã xác nhận'),
	// captcha_answer = nonce proof-of-work (Turnstile không có) — utils/captcha.js tự kiểm tra
	body('rules_accepted').custom(isTrue).withMessage('Vui lòng cam kết thực hiện nội quy lớp học'),
	...commitmentRules(),
	...infoRules(),
	staffNumber(internalOnly),
	body('email_token').optional({ values: 'falsy' }).isString().isLength({ max: 2000 }),
];

// Đơn đăng ký nháp (POST /public/course-registration/draft/application): chỉ nội viện, body =
// đúng dữ liệu người đó vừa gõ ở form. Không captcha / cam kết / email_token / hóa đơn
// (xem publicCourseRegistrationController — khớp lại mã NV + họ tên ở service). Khóa thừa bị bỏ qua.
const draftApplication = [
	body('source')
		.equals('internal')
		.withMessage('Chỉ nhân viên nội viện mới tải đơn điền sẵn ở bước này.'),
	fullNameRule,
	courseIdRule,
	programIdRule,
	emailRule,
	dobRule,
	issuedDateRule,
	genderRule,
	graduatedYearRule,
	nationalIdRule,
	...textRules((k) => !isInvoiceKey(k)),
	staffNumber(() => true),
];

// Tờ trình nháp (POST /public/course-registration/draft/proposal): chỉ cần xác định nhân viên + lớp
const draftProposal = [
	staffNumber(() => true),
	body('full_name')
		.isString()
		.trim()
		.notEmpty()
		.withMessage('Vui lòng nhập họ tên')
		.isLength({ max: 150 }),
	body('course_id')
		.isString()
		.trim()
		.notEmpty()
		.withMessage('Vui lòng chọn khóa học')
		.isLength({ max: 20 }),
	programIdRule,
	dobRule,
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

// Sửa bản khai (POST /public/course-registration/:code/amend) — JSON. Yếu tố thứ hai nằm trong
// `access` (CCCD đang lưu hoặc download_token) vì body còn chứa CCCD / email MỚI của bản sửa.
const amendment = [
	body('access').isObject().withMessage('Thiếu thông tin tra cứu'),
	body('access.national_id').optional({ values: 'falsy' }).isString().trim().isLength({ max: 20 }),
	body('access.download_token').optional({ values: 'falsy' }).isString().isLength({ max: 2000 }),
	body('access').custom((a) => {
		if (!a?.national_id && !a?.download_token)
			throw new Error('Vui lòng nhập số CCCD đã khai khi đăng ký');
		return true;
	}),
	body('source').isIn(SOURCES).withMessage('Đối tượng đăng ký không hợp lệ'),
	fullNameRule,
	body('captcha_token').notEmpty().withMessage('Thiếu mã xác nhận'),
	body('reason')
		.isString()
		.withMessage('Vui lòng ghi lý do sửa')
		.bail()
		.trim()
		.isLength({ min: 5, max: 500 })
		.withMessage('Lý do sửa từ 5 đến 500 ký tự'),
	...commitmentRules(),
	...infoRules(),
	body('email_token').optional({ values: 'falsy' }).isString().isLength({ max: 2000 }),
];

// Nhân viên đã đăng nhập cập nhật hồ sơ học viên của mình bằng thông tin vừa khai ở form đăng ký
// (PUT /me/training/registration-profile) — cùng kiểu dữ liệu với bản khai, không hóa đơn / cam kết.
const profileUpdate = [
	emailRule,
	dobRule,
	dobWithIdRule,
	issuedDateRule,
	genderRule,
	graduatedYearRule,
	nationalIdRule,
	...textRules((k) => !isInvoiceKey(k)),
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

module.exports = {
	registration,
	draftApplication,
	draftProposal,
	staffCheck,
	emailOtpRequest,
	emailOtpVerify,
	secondFactor,
	amendment,
	profileUpdate,
};
