// Upload ảnh minh hoạ (nhận xét rich-text, câu hỏi đề kiểm tra, bài test hội
// nghị) — chỉ nhận ảnh raster, không nhận SVG (có thể chứa script) hay các loại
// file khác mà upload.js cho phép.
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { secureUpload } = require('./secureUpload');

const { UPLOADS_ROOT, SAFE_ID } = require('../utils/uploadPaths');
const { badRequest } = require('../utils/httpError');

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

// subdir(req) → mảng thư mục con dưới UPLOADS_ROOT. Phần lấy từ req.params
// phải qua SAFE_ID (chặn path traversal) — dùng safeParam bên dưới.
const makeImageUpload = (subdir) =>
	secureUpload(
		multer({
			storage: multer.diskStorage({
				destination: (req, _file, cb) => {
					let parts;
					try {
						parts = subdir(req);
					} catch (err) {
						return cb(err);
					}
					const dir = path.join(UPLOADS_ROOT, ...parts);
					fs.mkdirSync(dir, { recursive: true });
					cb(null, dir);
				},
				filename: (_req, file, cb) => {
					const ext = path.extname(file.originalname).toLowerCase();
					const unique = crypto.randomBytes(16).toString('hex');
					cb(null, `${unique}${ext}`);
				},
			}),
			limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
			// Kiểm tra CẢ đuôi file: tên lưu trên đĩa giữ đuôi gốc, nên chỉ xét MIME (do
			// client tự khai) thì "anh.html" khai image/png sẽ được lưu và phục vụ như
			// trang HTML. Nội dung thật còn được kiểm tra thêm ở secureUpload.
			fileFilter: (_req, file, cb) => {
				const ext = path.extname(file.originalname).toLowerCase();
				if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
					return cb(badRequest('Chỉ chấp nhận ảnh PNG, JPEG, GIF hoặc WEBP'));
				}
				cb(null, true);
			},
		}),
	);

const safeParam = (req, name) => {
	const value = req.params[name];
	if (!SAFE_ID.test(value || '')) throw badRequest(`${name} không hợp lệ`);
	return value;
};

// Ảnh chèn vào nhận xét của hội đồng đánh giá đề tài
const uploadImage = makeImageUpload((req) => ['topics', safeParam(req, 'topic_id'), 'comments']);

module.exports = uploadImage;
module.exports.makeImageUpload = makeImageUpload;
module.exports.safeParam = safeParam;
