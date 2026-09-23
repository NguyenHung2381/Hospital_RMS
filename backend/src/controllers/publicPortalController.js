const service = require('../services/publicPortalService');
const { generateCaptcha, verifyCaptcha } = require('../utils/captcha');
const { success, created, error } = require('../utils/response');

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

const lookup = async (req, res, next) => {
	try {
		success(res, await service.lookupResults(req.query.national_id));
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
		if (!verifyCaptcha(req.body.captcha_token, req.body.captcha_answer)) {
			return error(res, 'Mã xác nhận không đúng hoặc đã hết hạn, vui lòng thử lại.', 400);
		}
		const result = await service.register(req.body);
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
		if (!verifyCaptcha(req.body.captcha_token, req.body.captcha_answer)) {
			return error(res, 'Mã xác nhận không đúng hoặc đã hết hạn, vui lòng thử lại.', 400);
		}
		const result = await service.registerTopic(req.body);
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

const getTopicStatus = async (req, res, next) => {
	try {
		const topic = await service.getTopicStatus(req.params.id);
		if (!topic) return error(res, 'Không tìm thấy hồ sơ với mã này.', 404);
		success(res, topic);
	} catch (err) {
		next(err);
	}
};

module.exports = {
	getCaptcha,
	getOpenCourses,
	getTraineeTypes,
	lookup,
	register,
	getOpenTopicRounds,
	getPublicCategories,
	getPublicDepartments,
	getPublicLevels,
	registerTopic,
	getTopicStatus,
	getFeaturedTopics,
};
