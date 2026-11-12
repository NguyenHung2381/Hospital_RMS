const multer = require('multer');
const path = require('path');
const { secureUpload } = require('./secureUpload');
const { httpError } = require('../utils/httpError');

// File PDF đọc trong bộ nhớ để xử lý (mẫu giấy chứng nhận CME) — không lưu
// nguyên file gốc nên không tính hạn mức upload. Mẫu xuất từ phần mềm thiết kế
// có thể nặng vài chục MB (ảnh nền độ phân giải cao, bản .ai nhúng kèm).
const uploadPdf = secureUpload(
	multer({
		storage: multer.memoryStorage(),
		limits: { fileSize: 60 * 1024 * 1024, files: 1 },
		fileFilter: (_req, file, cb) => {
			if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
				return cb(httpError(400, 'Chỉ nhận file PDF'));
			}
			cb(null, true);
		},
	}),
	{ quota: false },
);

module.exports = uploadPdf;
