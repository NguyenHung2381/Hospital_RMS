const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { isAllowedExtension } = require('./fileTypeAllowlist');
const { secureUpload } = require('./secureUpload');

const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_DIR || 'uploads');
const SAFE_ID = /^[A-Za-z0-9_-]{1,20}$/;

const storage = multer.diskStorage({
	destination: (req, _file, cb) => {
		if (!SAFE_ID.test(req.params.topic_id)) {
			return cb(Object.assign(new Error('topic_id không hợp lệ'), { statusCode: 400 }));
		}
		const topicDir = path.join(UPLOADS_ROOT, 'topics', req.params.topic_id);
		fs.mkdirSync(topicDir, { recursive: true });
		cb(null, topicDir);
	},
	filename: (_req, file, cb) => {
		const ext = path.extname(file.originalname);
		const base = path
			.basename(file.originalname, ext)
			.replace(/\s+/g, '_')
			.replace(/[^a-zA-Z0-9_\-.]/g, '');
		// random (không dùng Date.now()+số nhỏ, dễ đoán) — lớp phòng thủ thêm ngoài
		// chữ ký link /uploads (utils/signedUpload.js).
		const unique = crypto.randomBytes(16).toString('hex');
		cb(null, `${base}-${unique}${ext}`);
	},
});

// Hồ sơ đề tài (tài liệu, bản scan...): mặc định 50MB/file (trước đây 150MB),
// đổi bằng TOPIC_UPLOAD_MAX_MB. secureUpload: kiểm tra nội dung + quét virus + hạn mức.
const upload = secureUpload(multer({
	storage,
	limits: { fileSize: (Number(process.env.TOPIC_UPLOAD_MAX_MB) || 50) * 1024 * 1024 },
	fileFilter: (_req, file, cb) => {
		if (!isAllowedExtension(file.originalname)) {
			return cb(
				Object.assign(new Error('Định dạng file không được hỗ trợ'), {
					statusCode: 400,
				}),
			);
		}
		cb(null, true);
	},
}));

module.exports = upload;
