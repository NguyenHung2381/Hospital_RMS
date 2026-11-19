// Cổng công khai — đăng ký khóa đào tạo liên tục: nội quy, tra nhân viên nội viện, OTP
// email, tra cứu / tải đơn / nộp hồ sơ theo mã đăng ký. Gửi đăng ký: publicPortalController.register.
// Ngoài rate-limit theo IP ở route, mỗi ĐỐI TƯỢNG (mã NV, email, mã đăng ký) bị giới hạn
// riêng (attemptLimiter, khóa đã băm) — đổi IP liên tục vẫn không dò được.
const service = require('./publicCourseRegistrationService');
const { verifyCaptcha } = require('../../utils/captcha');
const { success, error } = require('../../utils/response');
const attempts = require('../../utils/attemptLimiter');
const { asyncHandler } = require('../../utils/asyncHandler');
const { normalizeCode } = require('../training/registration/courseRegistrationService');
const { normalizeEmail } = require('../training/registration/registrationEmailOtpService');

const HOUR = 60 * 60;
const STAFF_CHECK_PER_STAFF_MAX = 10;
const OTP_PER_EMAIL_MAX = 5;
const OTP_PER_STAFF_MAX = 5;
const CODE_PER_CODE_MAX = 20;
const CAPTCHA_FAILED = 'Mã xác nhận không đúng hoặc đã hết hạn, vui lòng thử lại.';

const getRules = asyncHandler(async (_req, res) => {
	success(res, await service.getRules());
});

// Cố ý giống tra nhân viên khi đăng ký hội nghị (seminars/:token/staff-lookup)
const staffCheck = asyncHandler(async (req, res) => {
	const sn = String(req.body.staff_number).trim();
	if (!(await attempts.hit('course-reg-staff-check', sn, STAFF_CHECK_PER_STAFF_MAX, HOUR)))
		return error(
			res,
			'Mã nhân viên này đã được tra quá nhiều lần. Vui lòng thử lại sau 1 giờ.',
			429,
		);
	success(res, await service.staffCheck(sn, req.body.full_name));
});

const requestEmailOtp = asyncHandler(async (req, res) => {
	if (!(await verifyCaptcha(req.body.captcha_token, req.body.captcha_answer, req.ip)))
		return error(res, CAPTCHA_FAILED, 400);
	if (
		!(await attempts.hit(
			'course-reg-otp-email',
			normalizeEmail(req.body.email),
			OTP_PER_EMAIL_MAX,
			HOUR,
		))
	)
		return error(res, 'Email này đã xin mã quá nhiều lần. Vui lòng thử lại sau 1 giờ.', 429);
	if (
		req.body.source === 'internal' &&
		!(await attempts.hit(
			'course-reg-otp-staff',
			String(req.body.staff_number).trim(),
			OTP_PER_STAFF_MAX,
			HOUR,
		))
	)
		return error(res, 'Mã nhân viên này đã xin mã quá nhiều lần. Vui lòng thử lại sau 1 giờ.', 429);
	success(res, await service.requestEmailOtp(req.body), 'Đã gửi mã xác minh tới email.');
});

const verifyEmailOtp = asyncHandler(async (req, res) => {
	success(
		res,
		await service.verifyEmailOtp(req.body.challenge_id, req.body.code),
		'Đã xác minh email.',
	);
});

// Giới hạn theo mã đăng ký rồi mới tra — áp cho mọi mã (có hay không) như nhau.
const withRegistration = async (req, res) => {
	const code = String(req.params.code);
	const key = normalizeCode(code) || code.slice(0, 32);
	if (!(await attempts.hit('course-reg-code', key, CODE_PER_CODE_MAX, HOUR))) {
		error(res, 'Mã đăng ký này đã được tra cứu quá nhiều lần. Vui lòng thử lại sau 1 giờ.', 429);
		return null;
	}
	return service.resolveAccess(code, req.body);
};

const getStatus = asyncHandler(async (req, res) => {
	const reg = await withRegistration(req, res);
	if (!reg) return;
	success(res, service.getStatus(reg));
});

const downloadApplication = asyncHandler(async (req, res) => {
	const reg = await withRegistration(req, res);
	if (!reg) return;
	const out = await service.renderApplication(reg);
	res.setHeader('Content-Type', out.mime);
	res.setHeader(
		'Content-Disposition',
		`attachment; filename*=UTF-8''${encodeURIComponent(out.filename)}`,
	);
	res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
	res.setHeader('Cache-Control', 'no-store');
	res.end(out.buffer);
});

const uploadDossier = asyncHandler(async (req, res) => {
	const reg = await withRegistration(req, res);
	if (!reg) return;
	success(res, await service.uploadDossier(reg, req.files), 'Đã nộp hồ sơ bổ sung.');
});

module.exports = {
	getRules,
	staffCheck,
	requestEmailOtp,
	verifyEmailOtp,
	getStatus,
	downloadApplication,
	uploadDossier,
};
