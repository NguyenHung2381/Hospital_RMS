const service = require('../services/publicPortalService');
const seminarParticipants = require('../services/seminarParticipantService');
const { generateCaptcha, verifyCaptcha } = require('../utils/captcha');
const { success, created, error } = require('../utils/response');
const attempts = require('../utils/attemptLimiter');

const getCaptcha = (req, res) => {
	success(res, generateCaptcha());
};

const getOpenCourses = async (req, res, next) => {
	try {
		success(res, await service.getOpenCourses());
	} catch (err) {
		next(err);
	}
};

const getTraineeTypes = async (req, res, next) => {
	try {
		success(res, await service.getTraineeTypes());
	} catch (err) {
		next(err);
	}
};

// Tra cứu kết quả học tập: phải khớp CẢ số CCCD, ngày sinh lẫn họ tên — chỉ có CCCD
// (12 số, có cấu trúc: mã tỉnh, giới tính, năm sinh) thì dò quét được họ tên,
// điểm, số chứng chỉ của người khác. Ngoài giới hạn theo IP ở route, mỗi số
// CCCD chỉ được tra LOOKUP_PER_ID_MAX lần/giờ dù đổi IP.
const LOOKUP_PER_ID_MAX = 5;

const lookup = async (req, res, next) => {
	try {
		const nationalId = String(req.query.national_id).trim();
		if (!(await attempts.hit('public-lookup', nationalId, LOOKUP_PER_ID_MAX, 60 * 60))) {
			return error(res, 'Số CCCD/CMND này đã được tra cứu quá nhiều lần. Vui lòng thử lại sau 1 giờ.', 429);
		}
		success(res, await service.lookupResults(nationalId, req.query.dob, req.query.full_name));
	} catch (err) {
		next(err);
	}
};

// Honeypot 'website': người dùng thật không thấy field này (ẩn bằng CSS) nên
// luôn để trống; bot điền tự động thường điền vào mọi input tìm thấy. Trả về
// một phản hồi "thành công" giả thay vì báo lỗi, để không lộ cơ chế chống bot.
const register = async (req, res, next) => {
	try {
		if (req.body.website) {
			return success(res, { trainee_id: null, enrollment_id: null }, 'Đăng ký thành công', 201);
		}
		if (!(await verifyCaptcha(req.body.captcha_token, req.body.captcha_answer, req.ip))) {
			return error(res, 'Mã xác nhận không đúng hoặc đã hết hạn, vui lòng thử lại.', 400);
		}
		const result = await service.register(req.body, req.files);
		created(res, result, 'Đăng ký khóa học thành công, vui lòng chờ duyệt.');
	} catch (err) {
		next(err);
	}
};

const getOpenTopicRounds = async (req, res, next) => {
	try {
		success(res, await service.getOpenTopicRounds());
	} catch (err) {
		next(err);
	}
};

const getTopicRoundByToken = async (req, res, next) => {
	try {
		const round = await service.getTopicRoundByToken(req.params.token);
		if (!round) return error(res, 'Liên kết đăng ký không hợp lệ hoặc đợt đã bị xoá.', 404);
		success(res, round);
	} catch (err) {
		next(err);
	}
};

const getPublicCategories = async (req, res, next) => {
	try {
		success(res, await service.getPublicCategories());
	} catch (err) {
		next(err);
	}
};

const getPublicDepartments = async (req, res, next) => {
	try {
		success(res, await service.getPublicDepartments());
	} catch (err) {
		next(err);
	}
};

const getPublicLevels = async (req, res, next) => {
	try {
		success(res, await service.getPublicLevels(req.query.round_id));
	} catch (err) {
		next(err);
	}
};

// Honeypot + captcha giống register() ở trên — đề tài công khai cũng là mục
// tiêu spam/bot tiềm năng như đăng ký khóa học.
const registerTopic = async (req, res, next) => {
	try {
		if (req.body.website) {
			return success(res, { topic_id: null }, 'Đăng ký thành công', 201);
		}
		if (!(await verifyCaptcha(req.body.captcha_token, req.body.captcha_answer, req.ip))) {
			return error(res, 'Mã xác nhận không đúng hoặc đã hết hạn, vui lòng thử lại.', 400);
		}
		const result = await service.registerTopic(req.body, req.files);
		created(res, result, 'Đăng ký đề tài thành công, vui lòng chờ khoa/phòng và hội đồng xét duyệt.');
	} catch (err) {
		next(err);
	}
};

const getFeaturedTopics = async (req, res, next) => {
	try {
		success(res, await service.getFeaturedTopics());
	} catch (err) {
		next(err);
	}
};

// Giới hạn theo từng MÃ hồ sơ (ngoài rate-limit theo IP ở route): chặn đoán
// email/SĐT của 1 hồ sơ bằng cách đổi IP liên tục.
const TOPIC_STATUS_PER_ID_MAX = 10;

const getTopicStatus = async (req, res, next) => {
	try {
		if (!(await attempts.hit('topic-status', req.params.id, TOPIC_STATUS_PER_ID_MAX, 60 * 60))) {
			return error(res, 'Mã hồ sơ này đã được tra cứu quá nhiều lần. Vui lòng thử lại sau 1 giờ.', 429);
		}
		const topic = await service.getTopicStatus(req.params.id, req.query.contact);
		if (!topic) return error(res, 'Không tìm thấy hồ sơ khớp với mã và thông tin liên hệ đã nhập.', 404);
		success(res, topic);
	} catch (err) {
		next(err);
	}
};

// ─── Hội nghị: đăng ký qua QR, vé, bài test ─────────────────────────────────
const getSeminar = async (req, res, next) => {
	try {
		const { scope, ...s } = await seminarParticipants.getPublicSeminar(req.params.token);
		success(res, s);
	} catch (err) {
		next(err);
	}
};

// Honeypot + captcha giống register()
const registerSeminar = async (req, res, next) => {
	try {
		if (req.body.website) return success(res, { ticket_code: null }, 'Đăng ký thành công', 201);
		if (!(await verifyCaptcha(req.body.captcha_token, req.body.captcha_answer, req.ip))) {
			return error(res, 'Mã xác nhận không đúng hoặc đã hết hạn, vui lòng thử lại.', 400);
		}
		created(res, await seminarParticipants.registerPublic(req.params.token, req.body), 'Đăng ký thành công');
	} catch (err) {
		next(err);
	}
};

const getSeminarTicket = async (req, res, next) => {
	try {
		success(res, await seminarParticipants.getTicket(req.params.code));
	} catch (err) {
		next(err);
	}
};

const submitSeminarTest = async (req, res, next) => {
	try {
		success(res, await seminarParticipants.submitTest(req.params.code, req.body.answers), 'Đã nộp bài test');
	} catch (err) {
		next(err);
	}
};

module.exports = {
	getSeminar,
	registerSeminar,
	getSeminarTicket,
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
