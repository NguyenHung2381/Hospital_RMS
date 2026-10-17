const multer = require('multer');
const path = require('path');
const { secureUpload } = require('./secureUpload');
const { httpError } = require('../utils/httpError');

// File Excel để import (đọc trong bộ nhớ, không lưu đĩa) — dùng chung cho các
// route /import-excel. Trước đây mỗi route tự khai multer không lọc định dạng:
// file bất kỳ đều được đưa thẳng vào thư viện đọc Excel. Giờ chỉ nhận .xlsx
// (exceljs không đọc .xls cũ) và nội dung phải đúng định dạng (secureUpload).
// Không tính hạn mức upload vì file không được lưu lại.
const EXCEL_EXT = new Set(['.xlsx']);

const uploadExcel = secureUpload(
	multer({
		storage: multer.memoryStorage(),
		limits: { fileSize: 10 * 1024 * 1024, files: 1 },
		fileFilter: (_req, file, cb) => {
			if (!EXCEL_EXT.has(path.extname(file.originalname).toLowerCase())) {
				return cb(httpError(400, 'Chỉ nhận file Excel .xlsx'));
			}
			cb(null, true);
		},
	}),
	{ quota: false },
);

module.exports = uploadExcel;
