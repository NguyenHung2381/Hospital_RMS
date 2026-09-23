const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { isAllowedExtension } = require('./fileTypeAllowlist');

const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_DIR || 'uploads');
const SAFE_ID = /^[A-Za-z0-9_-]{1,20}$/;

// Factory: 1 middleware multer riêng cho mỗi loại thực thể (trainee/course...)
// — lưu vào uploads/training/<entityType>/<id>/ giống cấu trúc uploads/topics/
// hiện có, nhưng tách hẳn thư mục để không lẫn với file NCKH.
//
// options.maxSizeMB: ghi đè giới hạn dung lượng mặc định (20MB, đủ cho hồ sơ/
// tài liệu thông thường). course_document/lesson_document dùng giới hạn riêng
// lớn hơn để chấp nhận video bài giảng — xem routes/courses.js,
// routes/trainingPrograms.js (biến môi trường TRAINING_MEDIA_MAX_MB).
// options.allowMedia: cho phép thêm đuôi video/audio (chỉ bật ở 2 route trên).
const createTrainingUpload = (entityType, options = {}) => {
	const maxSizeMB = options.maxSizeMB ?? Number(process.env.TRAINING_UPLOAD_MAX_MB || 20);
	const allowMedia = options.allowMedia ?? false;
	return multer({
		storage: multer.diskStorage({
			destination: (req, _file, cb) => {
				const id = req.params.id;
				if (!SAFE_ID.test(id)) {
					return cb(Object.assign(new Error('ID không hợp lệ'), { statusCode: 400 }));
				}
				const dir = path.join(UPLOADS_ROOT, 'training', entityType, id);
				fs.mkdirSync(dir, { recursive: true });
				cb(null, dir);
			},
			filename: (_req, file, cb) => {
				const ext = path.extname(file.originalname);
				const base = path
					.basename(file.originalname, ext)
					.replace(/\s+/g, '_')
					.replace(/[^a-zA-Z0-9_\-.]/g, '');
				// random (không dùng Date.now()+số nhỏ, dễ đoán) — file được serve
				// tĩnh không qua auth, tên đoán được là truy cập được thẳng hồ sơ người khác.
				const unique = crypto.randomBytes(16).toString('hex');
				cb(null, `${base}-${unique}${ext}`);
			},
		}),
		limits: { fileSize: maxSizeMB * 1024 * 1024 },
		fileFilter: (_req, file, cb) => {
			if (!isAllowedExtension(file.originalname, { allowMedia })) {
				return cb(
					Object.assign(new Error('Định dạng file không được hỗ trợ'), {
						statusCode: 400,
					}),
				);
			}
			cb(null, true);
		},
	});
};

module.exports = { createTrainingUpload };
