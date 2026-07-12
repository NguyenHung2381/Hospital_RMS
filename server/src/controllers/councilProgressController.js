/**
 * councilProgressController.js — cổng đánh giá tiến độ đề tài của thành viên hội đồng.
 * Quyền theo ghế hội đồng (kiểm tra trong service), không dùng permission admin.
 */
const progressService = require('../services/councilProgressService');
const { success, created } = require('../utils/response');

const getMyProgress = async (req, res, next) => {
	try {
		const data = await progressService.getMyProgress(req.user.id);
		return success(res, data);
	} catch (err) {
		next(err);
	}
};

const upsertReview = async (req, res, next) => {
	try {
		const { progress_percent, rating, comment } = req.body;
		await progressService.upsertReview(req.params.topic_id, req.user.id, {
			progress_percent,
			rating,
			comment,
		});
		return success(res, null, 'Đã lưu đánh giá tiến độ');
	} catch (err) {
		next(err);
	}
};

const upsertResult = async (req, res, next) => {
	try {
		const { conclusion, general_comment } = req.body;
		await progressService.upsertResult(req.params.topic_id, req.user.id, {
			conclusion,
			general_comment,
		});
		return success(res, null, 'Đã lưu kết luận của hội đồng');
	} catch (err) {
		next(err);
	}
};

// Middleware chạy TRƯỚC multer: chặn người không phải thư ký trước khi ghi file lên đĩa.
const requireSecretary = async (req, res, next) => {
	try {
		await progressService.assertSecretary(req.params.topic_id, req.user.id);
		next();
	} catch (err) {
		return res
			.status(err.status || 403)
			.json({ success: false, message: err.message });
	}
};

const filesFromRequest = (req) =>
	req.files.map((f) => ({
		file_name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
		file_url: `/uploads/topics/${req.params.topic_id}/${f.filename}`,
		file_size: f.size,
		mime_type: f.mimetype,
	}));

const uploadFiles = async (req, res, next) => {
	try {
		const { topic_id } = req.params;
		if (!req.files || req.files.length === 0) {
			return res
				.status(400)
				.json({ success: false, message: 'Chưa có file nào được tải lên' });
		}
		const result = await progressService.uploadEvalFiles(
			topic_id,
			filesFromRequest(req),
			req.user.id,
		);
		return created(res, result, 'Upload file đánh giá thành công');
	} catch (err) {
		next(err);
	}
};

const deleteFile = async (req, res, next) => {
	try {
		await progressService.deleteEvalFile(
			req.params.topic_id,
			req.params.file_id,
			req.user.id,
		);
		return success(res, null, 'Đã xóa file đánh giá');
	} catch (err) {
		next(err);
	}
};

const uploadMinutesFiles = async (req, res, next) => {
	try {
		const { topic_id } = req.params;
		if (!req.files || req.files.length === 0) {
			return res
				.status(400)
				.json({ success: false, message: 'Chưa có file nào được tải lên' });
		}
		const result = await progressService.uploadMinutesFiles(
			topic_id,
			filesFromRequest(req),
			req.user.id,
		);
		return created(res, result, 'Upload biên bản thành công');
	} catch (err) {
		next(err);
	}
};

const uploadCommentImage = async (req, res, next) => {
	try {
		if (!req.file) {
			return res
				.status(400)
				.json({ success: false, message: 'Chưa có ảnh nào được tải lên' });
		}
		const result = await progressService.uploadCommentImage(
			req.params.topic_id,
			req.user.id,
			req.file,
		);
		return created(res, result, 'Đã tải ảnh lên');
	} catch (err) {
		next(err);
	}
};

const deleteMinutesFile = async (req, res, next) => {
	try {
		await progressService.deleteMinutesFile(
			req.params.topic_id,
			req.params.file_id,
			req.user.id,
		);
		return success(res, null, 'Đã xóa biên bản');
	} catch (err) {
		next(err);
	}
};

module.exports = {
	getMyProgress,
	upsertReview,
	upsertResult,
	requireSecretary,
	uploadFiles,
	deleteFile,
	uploadMinutesFiles,
	uploadCommentImage,
	deleteMinutesFile,
};
