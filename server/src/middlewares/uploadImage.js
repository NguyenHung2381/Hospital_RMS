// Upload ảnh chèn vào nhận xét (rich-text) — chỉ nhận ảnh raster, không nhận
// SVG (có thể chứa script) hay các loại file khác mà upload.js cho phép.
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_DIR || 'uploads');
const SAFE_ID = /^[A-Za-z0-9_-]{1,20}$/;

const ALLOWED_MIME = new Set([
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
]);

const storage = multer.diskStorage({
	destination: (req, _file, cb) => {
		if (!SAFE_ID.test(req.params.topic_id)) {
			return cb(Object.assign(new Error('topic_id không hợp lệ'), { statusCode: 400 }));
		}
		const dir = path.join(
			UPLOADS_ROOT,
			'topics',
			req.params.topic_id,
			'comments',
		);
		fs.mkdirSync(dir, { recursive: true });
		cb(null, dir);
	},
	filename: (_req, file, cb) => {
		const ext = path.extname(file.originalname).toLowerCase();
		const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
		cb(null, `${unique}${ext}`);
	},
});

const uploadImage = multer({
	storage,
	limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
	fileFilter: (_req, file, cb) => {
		if (!ALLOWED_MIME.has(file.mimetype)) {
			return cb(
				Object.assign(new Error('Chỉ chấp nhận ảnh PNG, JPEG, GIF hoặc WEBP'), {
					statusCode: 400,
				}),
			);
		}
		cb(null, true);
	},
});

module.exports = uploadImage;
