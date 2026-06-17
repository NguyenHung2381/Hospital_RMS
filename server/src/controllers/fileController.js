const fileService = require('../services/fileService');
const { success, created } = require('../utils/response');
const { getPool, sql } = require('../config/db');

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7

function todayVN() {
	const now = new Date();
	const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
	return new Date(
		Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate()),
	);
}

async function assertUploadWindow(topicId) {
	const pool = await getPool();

	const { recordset } = await pool
		.request()
		.input('tid', sql.VarChar(15), topicId)
		.query(`
			SELECT t.status, t.round_id,
			       r.registration_start_date, r.registration_end_date,
			       r.supplement_start_date,   r.supplement_end_date
			FROM topics t
			LEFT JOIN research_rounds r ON r.id = t.round_id
			WHERE t.id = @tid
		`);

	if (!recordset[0]) {
		const err = new Error('Đề tài không tồn tại');
		err.status = 404;
		throw err;
	}

	const {
		status,
		round_id,
		registration_start_date,
		registration_end_date,
		supplement_start_date,
		supplement_end_date,
	} = recordset[0];

	const today = todayVN();

	const inRange = (start, end) => {
		if (!start || !end) return false;
		return today >= new Date(start) && today <= new Date(end);
	};

	// 1. Đợt đăng ký
	if (inRange(registration_start_date, registration_end_date)) {
		if (status === 'submitted' || status === 'supplement') return;
	}

	// 2. Đợt bổ sung
	if (inRange(supplement_start_date, supplement_end_date)) {
		if (status === 'supplement' || status === 'approved') return;
	}

	// 3. Đợt nộp báo cáo
	if (round_id && status === 'approved') {
		const { recordset: dls } = await pool
			.request()
			.input('rid', sql.VarChar(10), round_id)
			.query(`
				SELECT start_date, deadline_date
				FROM round_deadlines
				WHERE round_id = @rid AND deadline_type = 'nop_bao_cao'
			`);

		for (const dl of dls) {
			const afterStart = !dl.start_date || today >= new Date(dl.start_date);
			const dlEnd = dl.deadline_date ? new Date(dl.deadline_date) : null;
			if (afterStart && dlEnd && today <= dlEnd) return;
		}
	}

	const err = new Error('Không trong thời gian cho phép tải lên tài liệu');
	err.status = 403;
	throw err;
}

// Middleware: chỉ áp dụng với account_type === 'member'
const checkUploadWindow = async (req, res, next) => {
	if (req.user?.account_type !== 'member') return next();
	try {
		await assertUploadWindow(req.params.topic_id);
		next();
	} catch (err) {
		return res
			.status(err.status || 403)
			.json({ success: false, message: err.message });
	}
};

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

module.exports = { upload, getByTopic, getBatches, deleteFile, checkUploadWindow };
