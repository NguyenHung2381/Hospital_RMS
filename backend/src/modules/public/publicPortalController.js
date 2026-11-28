const service = require('./publicPortalService');
const { clientOf } = require('../training/registration/registrationConsent');
const courseRegistration = require('./publicCourseRegistrationService');
const emailOtp = require('../training/registration/registrationEmailOtpService');
const registrationFileService = require('../training/registration/registrationFileService');
const seminarPublicService = require('../seminars/seminarPublicService');
const seminarTestQrService = require('../seminars/seminarTestQrService');
const { generateCaptcha, verifyCaptcha } = require('../../utils/captcha');
const { success, created, error } = require('../../utils/response');
const attempts = require('../../utils/attemptLimiter');
const { asyncHandler } = require('../../utils/asyncHandler');
const { isModuleEnabled } = require('../../middlewares/moduleGuard');

const getCaptcha = asyncHandler(async (req, res) => {
	success(res, await generateCaptcha());
});

// Thu học phí tắt (Cấu hình hệ thống) ⇒ không hiện học phí của chương trình trên cổng công khai
const getOpenCourses = asyncHandler(async (req, res) => {
	const courses = await service.getOpenCourses();
	if (await isModuleEnabled('TUITION')) return success(res, courses);
	success(
		res,
		courses.map((c) => ({
			...c,
			programs: (c.programs ?? []).map((/** @type {any} */ p) => ({ ...p, tuition_fee: null })),
		})),
	);
});

const getTraineeTypes = asyncHandler(async (req, res) => {
	success(res, await service.getTraineeTypes());
});

// Tra cứu kết quả học tập: phải khớp CẢ số CCCD, ngày sinh lẫn họ tên — chỉ có CCCD
// (12 số, có cấu trúc: mã tỉnh, giới tính, năm sinh) thì dò quét được họ tên,
// điểm, số chứng chỉ của người khác. Ngoài giới hạn theo IP ở route, mỗi số
// CCCD chỉ được tra LOOKUP_PER_ID_MAX lần/giờ dù đổi IP.
const LOOKUP_PER_ID_MAX = 5;

const lookup = asyncHandler(async (req, res) => {
	const nationalId = String(req.body.national_id).trim();
	if (!(await attempts.hit('public-lookup', nationalId, LOOKUP_PER_ID_MAX, 60 * 60))) {
		return error(
			res,
			'Số CCCD/CMND này đã được tra cứu quá nhiều lần. Vui lòng thử lại sau 1 giờ.',
			429,
		);
	}
	success(res, await service.lookupResults(nationalId, req.body.dob, req.body.full_name));
});

// Honeypot 'website': người dùng thật không thấy field này (ẩn bằng CSS) nên
// luôn để trống; bot điền tự động thường điền vào mọi input tìm thấy. Trả về
// một phản hồi "thành công" giả (mã đăng ký + token đúng định dạng, không ghi gì)
// thay vì báo lỗi, để không lộ cơ chế chống bot.
// Đăng ký kèm CCCD là phép thử ngày sinh/họ tên với hồ sơ học viên đã có
// ⇒ giới hạn theo SỐ CCCD (không theo IP) như tra cứu, chặn dò từ nhiều IP; nội viện
// giới hạn thêm theo mã NV. Mọi nhánh (kể cả honeypot) trả cùng hình dạng
// { submitted, registration_code, download_token } + cùng thông điệp.
// Hồ sơ bắt buộc (files[<kind>]) kiểm TRƯỚC captcha và trước mọi ghi CSDL: thiếu file không đốt
// lượt captcha / giới hạn theo CCCD, và thông báo không phụ thuộc dữ liệu đã có (không lộ gì).
// Honeypot vẫn đứng đầu ⇒ bot không kèm file vẫn nhận phản hồi giả.
const REGISTER_PER_ID_MAX = 5;
const REGISTER_MESSAGE = 'Đã nhận đăng ký khóa học, vui lòng chờ duyệt.';
const DAY = 24 * 60 * 60;

const register = asyncHandler(async (req, res) => {
	if (req.body.website) {
		return created(res, courseRegistration.fakeAck(), REGISTER_MESSAGE);
	}
	const byKind = registrationFileService.collectByKind(req.files);
	registrationFileService.assertSubmission(req.body.source, byKind);
	if (!(await verifyCaptcha(req.body.captcha_token, req.body.captcha_answer, req.ip))) {
		return error(res, 'Mã xác nhận không đúng hoặc đã hết hạn, vui lòng thử lại.', 400);
	}
	const nationalId = String(req.body.national_id ?? '').trim();
	if (
		nationalId &&
		!(await attempts.hit('course-registration', nationalId, REGISTER_PER_ID_MAX, DAY))
	) {
		return error(
			res,
			'Số CCCD/CMND này đã đăng ký quá nhiều lần hôm nay. Vui lòng thử lại vào ngày mai.',
			429,
		);
	}
	// Mã NV đã chuẩn hóa: '0123' và '123' dùng chung 1 bộ đếm
	const staffNumber = courseRegistration.staffAttemptKey(req.body.staff_number);
	if (
		req.body.source === 'internal' &&
		!(await attempts.hit('course-registration-staff', staffNumber, REGISTER_PER_ID_MAX, DAY))
	) {
		return error(
			res,
			'Mã nhân viên này đã đăng ký quá nhiều lần hôm nay. Vui lòng thử lại vào ngày mai.',
			429,
		);
	}
	// OTP email (mặc định bật): bản khai phải mang email_token còn hạn — đối chiếu email
	// của token với email đăng ký (nội viện: email trong hồ sơ nhân sự) ở service.
	const otpRequired = await emailOtp.isRequired();
	const emailProof = otpRequired ? emailOtp.readToken(req.body.email_token) : null;
	if (otpRequired && !emailProof) return error(res, courseRegistration.EMAIL_NOT_VERIFIED, 400);
	const ack = await service.register(req.body, byKind, req.formCustom, {
		otpRequired,
		emailProof,
		client: clientOf(req),
	});
	created(res, ack, REGISTER_MESSAGE);
});

const getOpenTopicRounds = asyncHandler(async (req, res) => {
	success(res, await service.getOpenTopicRounds());
});

const getTopicRoundByToken = asyncHandler(async (req, res) => {
	const round = await service.getTopicRoundByToken(req.params.token);
	if (!round) return error(res, 'Liên kết đăng ký không hợp lệ hoặc đợt đã bị xóa.', 404);
	success(res, round);
});

const getPublicCategories = asyncHandler(async (req, res) => {
	success(res, await service.getPublicCategories());
});

const getPublicDepartments = asyncHandler(async (req, res) => {
	success(res, await service.getPublicDepartments());
});

const getPublicLevels = asyncHandler(async (req, res) => {
	success(res, await service.getPublicLevels(req.query.round_id));
});

// Honeypot + captcha giống register() ở trên — đề tài công khai cũng là mục
// tiêu spam/bot tiềm năng như đăng ký khóa học.
const registerTopic = asyncHandler(async (req, res) => {
	if (req.body.website) {
		return success(res, { topic_id: null }, 'Đăng ký thành công', 201);
	}
	if (!(await verifyCaptcha(req.body.captcha_token, req.body.captcha_answer, req.ip))) {
		return error(res, 'Mã xác nhận không đúng hoặc đã hết hạn, vui lòng thử lại.', 400);
	}
	const result = await service.registerTopic(req.body, req.files, req.formCustom);
	created(res, result, 'Đăng ký đề tài thành công, vui lòng chờ khoa/phòng và hội đồng xét duyệt.');
});

const getFeaturedTopics = asyncHandler(async (req, res) => {
	success(res, await service.getFeaturedTopics());
});

// Giới hạn theo từng MÃ hồ sơ (ngoài rate-limit theo IP ở route): chặn đoán
// email/SĐT của 1 hồ sơ bằng cách đổi IP liên tục.
const TOPIC_STATUS_PER_ID_MAX = 10;

const getTopicStatus = asyncHandler(async (req, res) => {
	if (!(await attempts.hit('topic-status', req.params.id, TOPIC_STATUS_PER_ID_MAX, 60 * 60))) {
		return error(
			res,
			'Mã hồ sơ này đã được tra cứu quá nhiều lần. Vui lòng thử lại sau 1 giờ.',
			429,
		);
	}
	const topic = await service.getTopicStatus(req.params.id, req.query.contact);
	if (!topic)
		return error(res, 'Không tìm thấy hồ sơ khớp với mã và thông tin liên hệ đã nhập.', 404);
	success(res, topic);
});

// ─── Hội nghị: đăng ký qua QR, vé, bài test ─────────────────────────────────
const getSeminar = asyncHandler(async (req, res) => {
	const { scope: _scope, ...s } = await seminarPublicService.getPublicSeminar(req.params.token);
	success(res, s);
});

const lookupSeminarStaff = asyncHandler(async (req, res) => {
	success(
		res,
		await seminarPublicService.lookupStaff(
			req.params.token,
			req.body.full_name,
			req.body.staff_number,
		),
	);
});

const lookupSeminarTicket = asyncHandler(async (req, res) => {
	if (!(await verifyCaptcha(req.body.captcha_token, req.body.captcha_answer, req.ip))) {
		return error(res, 'Mã xác nhận không đúng hoặc đã hết hạn, vui lòng thử lại.', 400);
	}
	success(
		res,
		await seminarPublicService.lookupTicket(req.params.token, {
			source: req.body.source,
			full_name: req.body.full_name,
			staff_number: req.body.staff_number,
			dob: req.body.dob,
		}),
	);
});

// Honeypot + captcha giống register()
const registerSeminar = asyncHandler(async (req, res) => {
	if (req.body.website) return success(res, { ticket_code: null }, 'Đăng ký thành công', 201);
	if (!(await verifyCaptcha(req.body.captcha_token, req.body.captcha_answer, req.ip))) {
		return error(res, 'Mã xác nhận không đúng hoặc đã hết hạn, vui lòng thử lại.', 400);
	}
	created(
		res,
		await seminarPublicService.registerPublic(req.params.token, req.body, req.formCustom),
		'Đăng ký thành công',
	);
});

const getSeminarTicket = asyncHandler(async (req, res) => {
	success(res, await seminarPublicService.getTicket(req.params.code));
});

// text/calendar + inline: iOS Safari mở thẳng bảng "Thêm vào Lịch"; Android tải file rồi mở bằng app Lịch
const getSeminarTicketCalendar = asyncHandler(async (req, res) => {
	const ics = await seminarPublicService.getTicketCalendar(req.params.code);
	if (!ics) return error(res, 'Hội nghị chưa có ngày tổ chức để thêm vào lịch.', 404);
	res.set({
		'Content-Type': 'text/calendar; charset=utf-8',
		'Content-Disposition': 'inline; filename="lich-hoi-nghi.ics"',
		'Cache-Control': 'no-store',
	});
	// Gửi file như các route tải file khác (res.end + Buffer) — nội dung là text/calendar đã
	// thoát ký tự (utils/seminarCalendar), không phải HTML
	res.end(Buffer.from(ics, 'utf8'));
});

// attachment ⇒ WebView Android (Zalo, Facebook...) chuyển link cho trình tải xuống của máy
const getSeminarTicketBadge = asyncHandler(async (req, res) => {
	const { png, fullName } = await seminarPublicService.getTicketBadgePng(req.params.code);
	const name = `ve-hoi-nghi-${String(fullName).trim()}.png`.replace(/[\\/:*?"<>|]|\p{Cc}/gu, ' ');
	res.set({
		'Content-Type': 'image/png',
		'Content-Disposition': `attachment; filename="ve-hoi-nghi.png"; filename*=UTF-8''${encodeURIComponent(name)}`,
		'Cache-Control': 'no-store',
	});
	res.end(png);
});

const startSeminarTest = asyncHandler(async (req, res) => {
	success(
		res,
		await seminarPublicService.startTest(req.params.code, req.params.testId),
		'Bắt đầu làm bài',
	);
});

const submitSeminarTest = asyncHandler(async (req, res) => {
	success(
		res,
		await seminarPublicService.submitTest(req.params.code, req.params.testId, req.body.answers),
		'Đã nộp bài kiểm tra',
	);
});

// QR chung của đề kiểm tra: nhập họ tên → mã lượt làm bài
const getSeminarTestQr = asyncHandler(async (req, res) => {
	success(res, await seminarTestQrService.getQrTest(req.params.token));
});

const enterSeminarTestQr = asyncHandler(async (req, res) => {
	success(res, await seminarTestQrService.enter(req.params.token, req.body));
});

const getSeminarTestAttempt = asyncHandler(async (req, res) => {
	success(res, await seminarTestQrService.getAttempt(req.params.code));
});

const startSeminarTestAttempt = asyncHandler(async (req, res) => {
	success(res, await seminarTestQrService.startAttempt(req.params.code), 'Bắt đầu làm bài');
});

const submitSeminarTestAttempt = asyncHandler(async (req, res) => {
	success(
		res,
		await seminarTestQrService.submitAttempt(req.params.code, req.body.answers),
		'Đã nộp bài kiểm tra',
	);
});

module.exports = {
	getSeminar,
	getSeminarTestQr,
	enterSeminarTestQr,
	getSeminarTestAttempt,
	startSeminarTestAttempt,
	submitSeminarTestAttempt,
	lookupSeminarStaff,
	lookupSeminarTicket,
	registerSeminar,
	getSeminarTicket,
	getSeminarTicketCalendar,
	getSeminarTicketBadge,
	startSeminarTest,
	submitSeminarTest,
	getCaptcha,
	getOpenCourses,
	getTraineeTypes,
	lookup,
	register,
	getOpenTopicRounds,
	getTopicRoundByToken,
	getPublicCategories,
	getPublicDepartments,
	getPublicLevels,
	registerTopic,
	getTopicStatus,
	getFeaturedTopics,
};
