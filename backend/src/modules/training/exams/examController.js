const examService = require('./examService');
const { success, created, notFound } = require('../../../utils/response');

// ─── Ngân hàng câu hỏi ───────────────────────────────────────────────────────
const listQuestions = async (req, res, next) => {
	try {
		return success(res, await examService.listQuestions(req.query));
	} catch (err) {
		next(err);
	}
};

const createQuestion = async (req, res, next) => {
	try {
		return created(res, await examService.createQuestion(req.body, req.user.id));
	} catch (err) {
		next(err);
	}
};

const createQuestionsBulk = async (req, res, next) => {
	try {
		const result = await examService.createQuestionsBulk(req.body.questions, req.user.id);
		return created(res, result, `Đã nhập ${result.created} câu hỏi`);
	} catch (err) {
		next(err);
	}
};

const uploadQuestionImage = (req, res) => {
	if (!req.file) return res.status(400).json({ success: false, message: 'Chưa chọn ảnh' });
	return created(res, { url: `/uploads/questions/${req.file.filename}` });
};

const updateQuestion = async (req, res, next) => {
	try {
		const item = await examService.updateQuestion(req.params.id, req.body, req.user.id);
		if (!item) return notFound(res);
		return success(res, item, 'Cập nhật thành công');
	} catch (err) {
		next(err);
	}
};

const removeQuestion = async (req, res, next) => {
	try {
		await examService.removeQuestion(req.params.id);
		return success(res, null, 'Xóa thành công');
	} catch (err) {
		next(err);
	}
};

// ─── Đề thi ──────────────────────────────────────────────────────────────────
const listPapers = async (req, res, next) => {
	try {
		return success(res, await examService.listPapers(req.query.course_id));
	} catch (err) {
		next(err);
	}
};

const getPaper = async (req, res, next) => {
	try {
		const item = await examService.getPaper(req.params.id);
		if (!item) return notFound(res);
		return success(res, item);
	} catch (err) {
		next(err);
	}
};

const createPaper = async (req, res, next) => {
	try {
		return created(res, await examService.createPaper(req.body, req.user.id));
	} catch (err) {
		next(err);
	}
};

const updatePaper = async (req, res, next) => {
	try {
		const item = await examService.updatePaper(req.params.id, req.body, req.user.id);
		if (!item) return notFound(res);
		return success(res, item, 'Cập nhật thành công');
	} catch (err) {
		next(err);
	}
};

const removePaper = async (req, res, next) => {
	try {
		await examService.removePaper(req.params.id);
		return success(res, null, 'Xóa thành công');
	} catch (err) {
		next(err);
	}
};

// ─── Chấm bài ────────────────────────────────────────────────────────────────
const listAttempts = async (req, res, next) => {
	try {
		return success(res, await examService.listAttempts(req.params.id));
	} catch (err) {
		next(err);
	}
};

const getAttempt = async (req, res, next) => {
	try {
		const item = await examService.getAttemptForGrading(req.params.attemptId);
		if (!item) return notFound(res);
		return success(res, item);
	} catch (err) {
		next(err);
	}
};

const gradeAnswer = async (req, res, next) => {
	try {
		const item = await examService.gradeEssayAnswer(
			req.params.attemptId,
			req.body.question_id,
			req.body.score,
			req.user.id,
		);
		return success(res, item, 'Đã chấm điểm');
	} catch (err) {
		next(err);
	}
};

// ─── Học viên làm bài ────────────────────────────────────────────────────────
const listAvailable = async (req, res, next) => {
	try {
		return success(res, await examService.listAvailablePapersForUser(req.user));
	} catch (err) {
		next(err);
	}
};

const startAttempt = async (req, res, next) => {
	try {
		return success(res, await examService.startAttempt(req.params.id, req.user));
	} catch (err) {
		next(err);
	}
};

const submitAttempt = async (req, res, next) => {
	try {
		return success(
			res,
			await examService.submitAttempt(req.params.id, req.body.answers, req.user),
			'Đã nộp bài thi',
		);
	} catch (err) {
		next(err);
	}
};

module.exports = {
	listQuestions,
	createQuestion,
	createQuestionsBulk,
	uploadQuestionImage,
	updateQuestion,
	removeQuestion,
	listPapers,
	getPaper,
	createPaper,
	updatePaper,
	removePaper,
	listAttempts,
	getAttempt,
	gradeAnswer,
	listAvailable,
	startAttempt,
	submitAttempt,
};
