const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { dynamicMulter, extensionFilter } = require('./upload');
const { secureUpload } = require('./secureUpload');

const { UPLOADS_ROOT, uniqueFilename } = require('../utils/uploadPaths');
const { httpError } = require('../utils/httpError');
// Chưa có mã đề tài/học viên lúc nhận file (bản ghi tạo sau khi qua captcha +
// kiểm tra nghiệp vụ) ⇒ ghi tạm vào _tmp/public, service chuyển sang thư mục
// chính thức (uploads/topics/<id>, uploads/training/trainee_document/<id>).
const TMP_DIR = path.join(UPLOADS_ROOT, '_tmp', 'public');

const MAX_FILES = 10;

// Định dạng & dung lượng theo Cấu hình hệ thống (utils/uploadPolicy.js), như route nội bộ.
const instance = dynamicMulter((policy) => ({
	maxSizeMB: policy.maxSizeMB,
	maxFiles: MAX_FILES,
	options: {
		storage: multer.diskStorage({
			destination: (_req, _file, cb) => {
				fs.mkdirSync(TMP_DIR, { recursive: true });
				cb(null, TMP_DIR);
			},
			filename: (_req, file, cb) => cb(null, uniqueFilename(file.originalname)),
		}),
		limits: { fileSize: policy.maxSizeMB * 1024 * 1024, files: MAX_FILES, fields: 20 },
		fileFilter: extensionFilter(policy.extensions, false),
	},
}));

// Không có tài khoản ⇒ không áp hạn mức/ngày (quota) — đã có rate-limit theo IP ở route.
const [precheck, multerMw, verify] = secureUpload(instance, { quota: false }).array(
	'files',
	MAX_FILES,
);

// File tạm chưa được service chuyển đi (lỗi validate, sai captcha, honeypot,
// lỗi nghiệp vụ...) ⇒ xoá khi trả response. File đã chuyển thì unlink lỗi ENOENT, bỏ qua.
const cleanupTmp = (req, res, next) => {
	let done = false;
	const cleanup = () => {
		if (done) return;
		done = true;
		for (const f of Array.isArray(req.files) ? req.files : []) {
			if (f.path) fs.promises.unlink(f.path).catch(() => {});
		}
	};
	res.on('finish', cleanup);
	res.on('close', cleanup);
	next();
};

// multipart: dữ liệu form nằm trong field `data` (JSON) để giữ nguyên cấu trúc
// lồng nhau (members[]...) cho express-validator phía sau. Request JSON thường
// (không kèm file) đi thẳng qua, multer tự bỏ qua.
const parseDataField = (req, _res, next) => {
	if (req.is('multipart/form-data')) {
		try {
			const data = JSON.parse(req.body?.data ?? '{}');
			if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
			req.body = data;
		} catch {
			return next(httpError(400, 'Dữ liệu đăng ký không hợp lệ'));
		}
	}
	next();
};

const publicUpload = [cleanupTmp, precheck, multerMw, verify, parseDataField];

// Chuyển file tạm sang thư mục đích; trả về danh sách file đã chuyển (path mới).
const moveUploadedFiles = async (files, destDir) => {
	await fs.promises.mkdir(destDir, { recursive: true });
	const moved = [];
	try {
		for (const f of files) {
			const target = path.join(destDir, f.filename);
			await fs.promises.rename(f.path, target);
			moved.push({ ...f, path: target });
		}
	} catch (err) {
		await Promise.all(moved.map((f) => fs.promises.unlink(f.path).catch(() => {})));
		throw err;
	}
	return moved;
};

module.exports = { publicUpload, moveUploadedFiles, UPLOADS_ROOT, MAX_FILES };
