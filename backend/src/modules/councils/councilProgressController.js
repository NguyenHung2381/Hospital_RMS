/**
 * councilProgressController.js — cổng đánh giá tiến độ đề tài của thành viên hội đồng.
 * Quyền theo ghế hội đồng (kiểm tra trong service), không dùng permission admin.
 */
const progressService = require('./councilProgressService');
const { success, created } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

const getMyProgress = asyncHandler(async (req, res) => {
	const data = await progressService.getMyProgress(req.user.id);
	return success(res, data);
});

const getMySeatCount = asyncHandler(async (req, res) => {
	const count = await progressService.getMySeatCount(req.user.id);
	return success(res, { count });
});

const upsertReview = asyncHandler(async (req, res) => {
	const { progress_percent, rating, comment } = req.body;
	await progressService.upsertReview(req.params.topic_id, req.user.id, {
		progress_percent,
		rating,
		comment,
	});
	return success(res, null, 'Đã lưu đánh giá tiến độ');
});

const upsertResult = asyncHandler(async (req, res) => {
	const { conclusion, general_comment } = req.body;
	await progressService.upsertResult(req.params.topic_id, req.user.id, {
		conclusion,
		general_comment,
	});
	return success(res, null, 'Đã lưu kết luận của hội đồng');
});

// Middleware chạy TRƯỚC multer: chặn người không phải thư ký trước khi ghi file lên đĩa.
const requireSecretary = asyncHandler(async (req, res, next) => {
	await progressService.assertSecretary(req.params.topic_id, req.user.id);
	next();
});

// Middleware chạy TRƯỚC multer cho ảnh chèn nhận xét: phải có ghế trong hội
// đồng của đề tài. Trước đây chỉ kiểm tra SAU khi multer đã ghi file — người
// không có ghế vẫn ghi được ảnh vào thư mục của đề tài bất kỳ (bị trả 403
// nhưng file đã nằm trên đĩa).
const requireCouncilSeat = asyncHandler(async (req, res, next) => {
	const roles = await progressService.getRolesForTopic(req.params.topic_id, req.user.id);
	if (!roles.length) {
		return res
			.status(403)
			.json({ success: false, message: 'Bạn không có ghế trong hội đồng đánh giá đề tài này.' });
	}
	next();
});

const filesFromRequest = (req) =>
	req.files.map((f) => ({
		file_name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
		file_url: `/uploads/topics/${req.params.topic_id}/${f.filename}`,
		file_size: f.size,
		mime_type: f.mimetype,
	}));

const uploadFiles = asyncHandler(async (req, res) => {
	const { topic_id } = req.params;
	if (!req.files || req.files.length === 0) {
		return res.status(400).json({ success: false, message: 'Chưa có file nào được tải lên' });
	}
	const result = await progressService.uploadEvalFiles(
		topic_id,
		filesFromRequest(req),
		req.user.id,
	);
	return created(res, result, 'Upload file đánh giá thành công');
});

const deleteFile = asyncHandler(async (req, res) => {
	await progressService.deleteEvalFile(req.params.topic_id, req.params.file_id, req.user.id);
	return success(res, null, 'Đã xóa file đánh giá');
});

const uploadMinutesFiles = asyncHandler(async (req, res) => {
	const { topic_id } = req.params;
	if (!req.files || req.files.length === 0) {
		return res.status(400).json({ success: false, message: 'Chưa có file nào được tải lên' });
	}
	const result = await progressService.uploadMinutesFiles(
		topic_id,
		filesFromRequest(req),
		req.user.id,
	);
	return created(res, result, 'Upload biên bản thành công');
});

const uploadCommentImage = asyncHandler(async (req, res) => {
	if (!req.file) {
		return res.status(400).json({ success: false, message: 'Chưa có ảnh nào được tải lên' });
	}
	const result = await progressService.uploadCommentImage(
		req.params.topic_id,
		req.user.id,
		req.file,
	);
	return created(res, result, 'Đã tải ảnh lên');
});

const deleteMinutesFile = asyncHandler(async (req, res) => {
	await progressService.deleteMinutesFile(req.params.topic_id, req.params.file_id, req.user.id);
	return success(res, null, 'Đã xóa biên bản');
});

module.exports = {
	getMyProgress,
	getMySeatCount,
	upsertReview,
	upsertResult,
	requireSecretary,
	requireCouncilSeat,
	uploadFiles,
	deleteFile,
	uploadMinutesFiles,
	uploadCommentImage,
	deleteMinutesFile,
};
