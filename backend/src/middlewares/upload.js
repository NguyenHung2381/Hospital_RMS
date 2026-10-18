const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { isAllowedExtension } = require('../utils/fileTypeAllowlist');
const { secureUpload } = require('./secureUpload');
const uploadPolicy = require('../utils/uploadPolicy');
const { UPLOADS_ROOT, SAFE_ID, uniqueFilename } = require('../utils/uploadPaths');
const { badRequest } = require('../utils/httpError');

// Lỗi multer không có statusCode ⇒ errorHandler trả 500 — đổi sang 400 dễ hiểu.
const friendlyMulterError = (err, { maxSizeMB, maxFiles }) => {
	if (!(err instanceof multer.MulterError)) return err;
	if (err.code === 'LIMIT_FILE_SIZE') return badRequest(`Mỗi file tối đa ${maxSizeMB}MB`);
	if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
		return badRequest(
			maxFiles ? `Tối đa ${maxFiles} file đính kèm` : 'Số lượng file vượt quá giới hạn',
		);
	}
	return badRequest('File đính kèm không hợp lệ');
};

/**
 * multer cố định limits/fileFilter lúc khởi tạo ⇒ dựng instance mỗi request theo
 * cấu hình hệ thống hiện tại (systemSettingService cache 15s, không chạm DB mỗi lần).
 * build(policy) → { options: multer options, maxSizeMB, maxFiles? }.
 * Trả object có single/array/fields như multer để bọc bằng secureUpload.
 */
const dynamicMulter = (build) => {
	const method =
		(name) =>
		(...args) =>
		async (req, res, next) => {
			if (!req.is('multipart/form-data')) return next(); // multer cũng bỏ qua — khỏi đọc cấu hình
			let built;
			try {
				built = build(await uploadPolicy.getPolicy());
			} catch (err) {
				return next(err);
			}
			multer(built.options)[name](...args)(req, res, (err) =>
				next(err && friendlyMulterError(err, built)),
			);
		};
	return { single: method('single'), array: method('array'), fields: method('fields') };
};

const extensionFilter = (allowed, allowMedia) => (_req, file, cb) => {
	if (!isAllowedExtension(file.originalname, { allowed, allowMedia })) {
		return cb(badRequest(`Định dạng file không được hỗ trợ. Chỉ nhận: ${allowed.join(', ')}`));
	}
	cb(null, true);
};

/**
 * Multer lưu đĩa vào UPLOADS_ROOT/<dirParts(id)>/, id lấy từ req.params[idParam].
 * secureUpload: kiểm tra nội dung + quét virus + hạn mức dung lượng/ngày.
 * Định dạng & dung lượng theo Cấu hình hệ thống (utils/uploadPolicy.js);
 * maxSizeMB ghi đè dung lượng (route video bài giảng), allowMedia cho thêm video/audio.
 */
const createDiskUpload = ({ idParam, dirParts, maxSizeMB, allowMedia = false }) =>
	secureUpload(
		dynamicMulter((policy) => {
			const limitMB = maxSizeMB ?? policy.maxSizeMB;
			return {
				maxSizeMB: limitMB,
				options: {
					storage: multer.diskStorage({
						destination: (req, _file, cb) => {
							const id = req.params[idParam];
							if (!SAFE_ID.test(id)) return cb(badRequest(`${idParam} không hợp lệ`));
							const dir = path.join(UPLOADS_ROOT, ...dirParts(id));
							fs.mkdirSync(dir, { recursive: true });
							cb(null, dir);
						},
						filename: (_req, file, cb) => cb(null, uniqueFilename(file.originalname)),
					}),
					limits: { fileSize: limitMB * 1024 * 1024 },
					fileFilter: extensionFilter(policy.extensions, allowMedia),
				},
			};
		}),
	);

// Hồ sơ đề tài (tài liệu, bản scan...)
const upload = createDiskUpload({
	idParam: 'topic_id',
	dirParts: (id) => ['topics', id],
});

module.exports = upload;
module.exports.createDiskUpload = createDiskUpload;
module.exports.dynamicMulter = dynamicMulter;
module.exports.extensionFilter = extensionFilter;
