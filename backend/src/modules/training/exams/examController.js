const examService = require('./examService');
const { success, created, notFound } = require('../../../utils/response');
const { asyncHandler } = require('../../../utils/asyncHandler');

// ─── Ngân hàng câu hỏi ───────────────────────────────────────────────────────
const listQuestions = asyncHandler(async (req, res) => {
	return success(res, await examService.listQuestions(req.query));
});

const createQuestion = asyncHandler(async (req, res) => {
	return created(res, await examService.createQuestion(req.body, req.user.id));
});

const createQuestionsBulk = asyncHandler(async (req, res) => {
	const result = await examService.createQuestionsBulk(req.body.questions, req.user.id);
	return created(res, result, `Đã nhập ${result.created} câu hỏi`);
});

const uploadQuestionImage = (req, res) => {
	if (!req.file) return res.status(400).json({ success: false, message: 'Chưa chọn ảnh' });
	return created(res, { url: `/uploads/questions/${req.file.filename}` });
};

const updateQuestion = asyncHandler(async (req, res) => {
	const item = await examService.updateQuestion(req.params.id, req.body, req.user.id);
	if (!item) return notFound(res);
	return success(res, item, 'Cập nhật thành công');
});

const removeQuestion = asyncHandler(async (req, res) => {
	await examService.removeQuestion(req.params.id);
	return success(res, null, 'Xóa thành công');
});

// ─── Đề thi ──────────────────────────────────────────────────────────────────
const listPapers = asyncHandler(async (req, res) => {
	return success(res, await examService.listPapers(req.query.course_id));
});

const getPaper = asyncHandler(async (req, res) => {
	const item = await examService.getPaper(req.params.id);
	if (!item) return notFound(res);
	return success(res, item);
});

const createPaper = asyncHandler(async (req, res) => {
	return created(res, await examService.createPaper(req.body, req.user.id));
});

const updatePaper = asyncHandler(async (req, res) => {
	const item = await examService.updatePaper(req.params.id, req.body, req.user.id);
	if (!item) return notFound(res);
	return success(res, item, 'Cập nhật thành công');
});

const removePaper = asyncHandler(async (req, res) => {
	await examService.removePaper(req.params.id);
	return success(res, null, 'Xóa thành công');
});

// ─── Chấm bài ────────────────────────────────────────────────────────────────
const listAttempts = asyncHandler(async (req, res) => {
	return success(res, await examService.listAttempts(req.params.id));
});

const getAttempt = asyncHandler(async (req, res) => {
	const item = await examService.getAttemptForGrading(req.params.attemptId);
	if (!item) return notFound(res);
	return success(res, item);
});

const gradeAnswer = asyncHandler(async (req, res) => {
	const item = await examService.gradeEssayAnswer(
		req.params.attemptId,
		req.body.question_id,
		req.body.score,
		req.user.id,
	);
	return success(res, item, 'Đã chấm điểm');
});

// ─── Học viên làm bài ────────────────────────────────────────────────────────
const listAvailable = asyncHandler(async (req, res) => {
	return success(res, await examService.listAvailablePapersForUser(req.user));
});

const startAttempt = asyncHandler(async (req, res) => {
	return success(res, await examService.startAttempt(req.params.id, req.user));
});

const submitAttempt = asyncHandler(async (req, res) => {
	return success(
		res,
		await examService.submitAttempt(req.params.id, req.body.answers, req.user),
		'Đã nộp bài thi',
	);
});

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
