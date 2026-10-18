const fileService = require('./fileService');
const topicService = require('./topicService');
const { success, created } = require('../../utils/response');
const { getPool, sql } = require('../../config/db');
const { assertTopicActionWindow } = require('./deadlineGuard');
const { isDeadlineBound } = require('../../permissions/authz');

// Middleware: chỉ áp dụng với vai trò phạm vi "own" (đơn vị/superuser không bị chặn theo mốc)
const checkUploadWindow = async (req, res, next) => {
	if (!isDeadlineBound(req.user)) return next();
	try {
		await assertTopicActionWindow(req.params.topic_id, req.user.id, 'add-files');
		next();
	} catch (err) {
		next(err);
	}
};

// Middleware xoá file: chỉ cho phép trong cửa sổ "Sửa" hoặc "Bổ sung" (có mục Tài liệu).
// Mọi vai trò: file phải thuộc đề tài trong phạm vi của người xoá (chống IDOR —
// trước đây phạm vi khoa xoá được file của đề tài khoa khác theo file_id).
const checkDeleteWindow = async (req, res, next) => {
	try {
		const pool = await getPool();
		const { recordset } = await pool
			.request()
			.input('fid', sql.VarChar(32), req.params.file_id)
			.query(`SELECT topic_id FROM files WHERE id = @fid AND is_deleted = 0`);
		if (!recordset[0]) {
			return res.status(404).json({ success: false, message: 'Không tìm thấy file' });
		}
		await topicService.assertTopicInScope(recordset[0].topic_id, req.user);
		if (!isDeadlineBound(req.user)) return next();
		await assertTopicActionWindow(recordset[0].topic_id, req.user.id, 'delete-files');
		next();
	} catch (err) {
		next(err);
	}
};

const upload = async (req, res, next) => {
	try {
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
	} catch (err) {
		next(err);
	}
};

const getByTopic = async (req, res, next) => {
	try {
		const result = await fileService.getByTopic(req.params.topic_id, req.query);
		return success(res, result);
	} catch (err) {
		next(err);
	}
};

const getBatches = async (req, res, next) => {
	try {
		const batches = await fileService.getBatches(req.params.topic_id);
		return success(res, batches);
	} catch (err) {
		next(err);
	}
};

const deleteFile = async (req, res, next) => {
	try {
		await fileService.deleteFile(req.params.file_id, req.user.id);
		return success(res, null, 'Xóa file thành công');
	} catch (err) {
		next(err);
	}
};

module.exports = {
	upload,
	getByTopic,
	getBatches,
	deleteFile,
	checkUploadWindow,
	checkDeleteWindow,
};
