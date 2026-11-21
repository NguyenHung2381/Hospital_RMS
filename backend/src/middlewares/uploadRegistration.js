// Upload hồ sơ bắt buộc của form đăng ký khóa đào tạo liên tục (cổng công khai và cổng
// nhân viên). Tách khỏi uploadPublic.js / upload.js vì:
//   - đuôi file CỐ ĐỊNH (PDF / JPG / PNG), không theo "Định dạng file" của Cấu hình hệ thống;
//   - mỗi LOẠI hồ sơ là 1 phần multipart riêng (files[<kind>]) ⇒ multer .fields() tự chặn
//     file thứ hai cùng loại và tên phần lạ, giữ mã lỗi gốc để báo đúng nghĩa.
// Dung lượng mỗi file = UPLOAD_MAX_MB. Vẫn qua secureUpload (magic bytes + ClamAV).
// Ghi tạm vào uploads/_tmp/public — service chuyển sang thư mục chính thức, file còn lại
// bị cleanupTmp xóa khi trả response (kể cả khi lỗi).
//
// File này chỉ giữ CƠ CHẾ. Đuôi file, câu báo lỗi và tên các phần multipart là hiểu biết
// nghiệp vụ của module training (registrationFileKinds.js) nên được truyền vào
// createRegistrationUpload — hạ tầng không require module nghiệp vụ (npm run check:deps).
// Middleware dựng sẵn cho route: modules/training/registration/registrationUpload.js.
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { secureUpload } = require('./secureUpload');
const { cleanupTmp, parseDataField } = require('./uploadPublic');
const uploadPolicy = require('../utils/uploadPolicy');
const { UPLOADS_ROOT, uniqueFilename } = require('../utils/uploadPaths');
const { badRequest } = require('../utils/httpError');

const TMP_DIR = path.join(UPLOADS_ROOT, '_tmp', 'public');

const ONE_PER_KIND = 'Mỗi loại hồ sơ chỉ nhận 1 file, đính kèm đúng ô đã quy định.';

// Lỗi multer không có statusCode ⇒ errorHandler trả 500 — đổi sang 400 dễ hiểu.
const friendlyError = (err, maxSizeMB) => {
	if (!(err instanceof multer.MulterError)) return err;
	if (err.code === 'LIMIT_FILE_SIZE') return badRequest(`Mỗi file tối đa ${maxSizeMB}MB`);
	if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT')
		return badRequest(ONE_PER_KIND);
	return badRequest('File đính kèm không hợp lệ');
};

const storage = multer.diskStorage({
	destination: (_req, _file, cb) => {
		fs.mkdirSync(TMP_DIR, { recursive: true });
		cb(null, TMP_DIR);
	},
	filename: (_req, file, cb) => cb(null, uniqueFilename(file.originalname)),
});

/**
 * Dựng 2 chuỗi middleware upload hồ sơ đăng ký.
 * @param {object} options
 * @param {string[]} options.extensions đuôi file được nhận (chữ thường, có dấu chấm)
 * @param {string} options.acceptMessage câu báo khi đuôi file không được nhận
 * @param {string[]} options.formFields tên các phần multipart khi gửi đăng ký, mỗi phần 1 file
 * @param {number} options.maxFiles số file tối đa của 1 lần gửi đăng ký
 */
const createRegistrationUpload = ({ extensions, acceptMessage, formFields, maxFiles }) => {
	const fileFilter = (_req, file, cb) => {
		const ext = path.extname(file.originalname).toLowerCase();
		if (!extensions.includes(ext)) return cb(badRequest(acceptMessage));
		cb(null, true);
	};

	// Đối tượng "giống multer" (fields / single / array) để bọc bằng secureUpload. multer cố định
	// limits lúc khởi tạo ⇒ dựng instance mỗi request theo UPLOAD_MAX_MB hiện hành.
	const method =
		(name, files) =>
		(...args) =>
		async (req, res, next) => {
			if (!req.is('multipart/form-data')) return next();
			let policy;
			try {
				policy = await uploadPolicy.getPolicy();
			} catch (err) {
				return next(err);
			}
			multer({
				storage,
				fileFilter,
				limits: { fileSize: policy.maxSizeMB * 1024 * 1024, files, fields: 20 },
			})[name](...args)(req, res, (err) => next(err && friendlyError(err, policy.maxSizeMB)));
		};

	const instance = {
		fields: method('fields', maxFiles),
		single: method('single', 1),
		array: method('array', maxFiles),
	};

	// Gửi đăng ký (công khai): data = JSON của form + mỗi phần trong formFields 1 file; không có
	// tài khoản ⇒ không áp hạn mức dung lượng / ngày (đã có rate-limit theo IP ở route).
	const registrationFormUpload = [
		cleanupTmp,
		...secureUpload(instance, { quota: false }).fields(
			formFields.map((name) => ({ name, maxCount: 1 })),
		),
		parseDataField,
	];

	// Nộp / thay 1 file: phần `file` (+ `data` = yếu tố thứ hai ở cổng công khai). Có tài khoản
	// (cổng nhân viên) thì tính hạn mức tải lên / ngày.
	const registrationFileUpload = [
		cleanupTmp,
		...secureUpload(instance).single('file'),
		parseDataField,
	];

	return { registrationFormUpload, registrationFileUpload };
};

module.exports = { createRegistrationUpload };
