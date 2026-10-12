const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { isAllowedExtension } = require('./fileTypeAllowlist');
const { secureUpload } = require('./secureUpload');
const { UPLOADS_ROOT, SAFE_ID, uniqueFilename } = require('../utils/uploadPaths');

const httpError = (message) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * Multer lưu đĩa vào UPLOADS_ROOT/<dirParts(id)>/, id lấy từ req.params[idParam].
 * secureUpload: kiểm tra nội dung + quét virus + hạn mức dung lượng/ngày.
 * allowMedia: cho phép thêm đuôi video/audio.
 */
const createDiskUpload = ({ idParam, dirParts, maxSizeMB, allowMedia = false }) =>
	secureUpload(
		multer({
			storage: multer.diskStorage({
				destination: (req, _file, cb) => {
					const id = req.params[idParam];
					if (!SAFE_ID.test(id)) return cb(httpError(`${idParam} không hợp lệ`));
					const dir = path.join(UPLOADS_ROOT, ...dirParts(id));
					fs.mkdirSync(dir, { recursive: true });
					cb(null, dir);
				},
				filename: (_req, file, cb) => cb(null, uniqueFilename(file.originalname)),
			}),
			limits: { fileSize: maxSizeMB * 1024 * 1024 },
			fileFilter: (_req, file, cb) => {
				if (!isAllowedExtension(file.originalname, { allowMedia })) {
					return cb(httpError('Định dạng file không được hỗ trợ'));
				}
				cb(null, true);
			},
		}),
	);

// Hồ sơ đề tài (tài liệu, bản scan...): mặc định 50MB/file, đổi bằng TOPIC_UPLOAD_MAX_MB.
const upload = createDiskUpload({
	idParam: 'topic_id',
	dirParts: (id) => ['topics', id],
	maxSizeMB: Number(process.env.TOPIC_UPLOAD_MAX_MB) || 50,
});

module.exports = upload;
module.exports.createDiskUpload = createDiskUpload;
