// Upload hồ sơ bắt buộc của form đăng ký khóa đào tạo liên tục (cổng công khai và cổng
// nhân viên). Tách khỏi uploadPublic.js / upload.js vì:
//   - đuôi file CỐ ĐỊNH (PDF / JPG / PNG), không theo "Định dạng file" của Cấu hình hệ thống;
//   - mỗi LOẠI hồ sơ là 1 phần multipart riêng (files[<kind>]) ⇒ multer .fields() tự chặn
//     file thứ hai cùng loại và tên phần lạ, giữ mã lỗi gốc để báo đúng nghĩa.
// Dung lượng mỗi file = UPLOAD_MAX_MB. Vẫn qua secureUpload (magic bytes + ClamAV).
// Ghi tạm vào uploads/_tmp/public — service chuyển sang thư mục chính thức, file còn lại
// bị cleanupTmp xóa khi trả response (kể cả khi lỗi).
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { secureUpload } = require('./secureUpload');
const { cleanupTmp, parseDataField } = require('./uploadPublic');
const uploadPolicy = require('../utils/uploadPolicy');
const { UPLOADS_ROOT, uniqueFilename } = require('../utils/uploadPaths');
const { badRequest } = require('../utils/httpError');
const {
	REGISTRATION_FILE_EXTENSIONS,
	ACCEPT_MESSAGE,
	UPLOADABLE_KINDS,
	FORM_FIELD,
} = require('../modules/training/registration/registrationFileKinds');

const TMP_DIR = path.join(UPLOADS_ROOT, '_tmp', 'public');
// Tối đa 4 file / lần gửi đăng ký (ngoại viện: 4 loại; nội viện: 2)
const FORM_MAX_FILES = 4;

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

const fileFilter = (_req, file, cb) => {
	const ext = path.extname(file.originalname).toLowerCase();
	if (!REGISTRATION_FILE_EXTENSIONS.includes(ext)) return cb(badRequest(ACCEPT_MESSAGE));
	cb(null, true);
};

// Đối tượng "giống multer" (fields / single / array) để bọc bằng secureUpload. multer cố định
// limits lúc khởi tạo ⇒ dựng instance mỗi request theo UPLOAD_MAX_MB hiện hành.
const method =
	(name, maxFiles) =>
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
			limits: { fileSize: policy.maxSizeMB * 1024 * 1024, files: maxFiles, fields: 20 },
		})[name](...args)(req, res, (err) => next(err && friendlyError(err, policy.maxSizeMB)));
	};

const instance = {
	fields: method('fields', FORM_MAX_FILES),
	single: method('single', 1),
	array: method('array', FORM_MAX_FILES),
};

// Gửi đăng ký (công khai): data = JSON của form + files[<kind>]; không có tài khoản ⇒ không
// áp hạn mức dung lượng / ngày (đã có rate-limit theo IP ở route).
const registrationFormUpload = [
	cleanupTmp,
	...secureUpload(instance, { quota: false }).fields(
		UPLOADABLE_KINDS.map((k) => ({ name: FORM_FIELD(k), maxCount: 1 })),
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

module.exports = { registrationFormUpload, registrationFileUpload, FORM_MAX_FILES };
