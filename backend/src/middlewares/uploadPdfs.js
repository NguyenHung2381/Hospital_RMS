const multer = require('multer');
const path = require('path');
const { secureUpload } = require('./secureUpload');
const { httpError } = require('../utils/httpError');

// Nhiều file PDF đọc trong bộ nhớ (hồ sơ trình ký: tối đa 20 văn bản / lần, mỗi file ≤ 20 MB) —
// service tự lưu bản đã kiểm vào uploads/sign-requests/<id>/. Kiểm nội dung khớp đuôi + quét
// virus qua secureUpload như mọi đường upload khác; tính hạn mức upload/ngày vì có lưu lại.
const uploadPdfs = secureUpload(
	multer({
		storage: multer.memoryStorage(),
		limits: { fileSize: 20 * 1024 * 1024, files: 20 },
		fileFilter: (_req, file, cb) => {
			if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
				return cb(httpError(400, `Chỉ nhận file PDF: ${file.originalname}`));
			}
			cb(null, true);
		},
	}),
);

module.exports = uploadPdfs;
