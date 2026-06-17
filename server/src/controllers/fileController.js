const fileService = require('../services/fileService');
const { success, created } = require('../utils/response');

const upload = async (req, res, next) => {
	try {
		const { topic_id } = req.params;
		const { batch_note } = req.body;

		if (!req.files || req.files.length === 0) {
			return res
				.status(400)
				.json({ success: false, message: 'Chưa có file nào được tải lên' });
		}

		const files = req.files.map((f) => ({
			file_name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
			file_url: `/uploads/topics/${topic_id}/${f.filename}`,
			file_size: f.size,
			mime_type: f.mimetype,
		}));

		const result = await fileService.uploadFiles(
			topic_id,
			files,
			batch_note,
			req.user.id,
		);
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

module.exports = { upload, getByTopic, getBatches, deleteFile };
