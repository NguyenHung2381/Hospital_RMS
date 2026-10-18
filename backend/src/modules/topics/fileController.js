const fileService = require('./fileService');
const topicService = require('./topicService');
const { success, created } = require('../../utils/response');
const { assertTopicActionWindow } = require('./deadlineGuard');
const { isDeadlineBound } = require('../../permissions/authz');
const { asyncHandler } = require('../../utils/asyncHandler');

// Middleware: chỉ áp dụng với vai trò phạm vi "own" (đơn vị/superuser không bị chặn theo mốc)
const checkUploadWindow = asyncHandler(async (req, res, next) => {
	if (!isDeadlineBound(req.user)) return next();
	await assertTopicActionWindow(req.params.topic_id, req.user.id, 'add-files');
	next();
});

// Middleware xoá file: chỉ cho phép trong cửa sổ "Sửa" hoặc "Bổ sung" (có mục Tài liệu).
// Mọi vai trò: file phải thuộc đề tài trong phạm vi của người xoá (chống IDOR —
// trước đây phạm vi khoa xoá được file của đề tài khoa khác theo file_id).
const checkDeleteWindow = asyncHandler(async (req, res, next) => {
	const topicId = await fileService.findTopicId(req.params.file_id);
	if (!topicId) return res.status(404).json({ success: false, message: 'Không tìm thấy file' });
	await topicService.assertTopicInScope(topicId, req.user);
	if (!isDeadlineBound(req.user)) return next();
	await assertTopicActionWindow(topicId, req.user.id, 'delete-files');
	next();
});

const upload = asyncHandler(async (req, res) => {
	const { topic_id } = req.params;
	const { batch_note } = req.body;

	if (!req.files || req.files.length === 0) {
		return res.status(400).json({ success: false, message: 'Chưa có file nào được tải lên' });
	}

	const files = req.files.map((f) => ({
		file_name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
		file_url: `/uploads/topics/${topic_id}/${f.filename}`,
		file_size: f.size,
		mime_type: f.mimetype,
	}));

	const result = await fileService.uploadFiles(topic_id, files, batch_note, req.user.id);
	return created(res, result, 'Upload file thành công');
});

const getByTopic = asyncHandler(async (req, res) => {
	const result = await fileService.getByTopic(req.params.topic_id, req.query);
	return success(res, result);
});

const getBatches = asyncHandler(async (req, res) => {
	const batches = await fileService.getBatches(req.params.topic_id);
	return success(res, batches);
});

const deleteFile = asyncHandler(async (req, res) => {
	await fileService.deleteFile(req.params.file_id, req.user.id);
	return success(res, null, 'Xóa file thành công');
});

module.exports = {
	upload,
	getByTopic,
	getBatches,
	deleteFile,
	checkUploadWindow,
	checkDeleteWindow,
};
