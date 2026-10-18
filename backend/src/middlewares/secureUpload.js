const fs = require('fs/promises');
const path = require('path');
const { readHead, matchesExtension } = require('../utils/fileSignature');
const clamav = require('../utils/clamav');
const quota = require('../utils/uploadQuota');
const securityEvents = require('../modules/audit/securityEventService');
const { httpError } = require('../utils/httpError');
const logger = require('../config/logger');

// Bọc 1 instance multer để mọi route upload tự có thêm 3 lớp kiểm tra:
//   1. Hạn mức dung lượng/ngày của tài khoản (utils/uploadQuota.js) — kiểm tra
//      theo Content-Length TRƯỚC khi nhận file, cộng dồn sau khi nhận xong.
//   2. Nội dung file khớp phần mở rộng (utils/fileSignature.js).
//   3. Quét virus bằng ClamAV nếu đã bật (utils/clamav.js).
// Không qua thì xoá ngay file vừa ghi, trả lỗi. Dùng như multer:
//   secureUpload(multer({...})).single('file') → mảng middleware (Express tự trải).

const displayName = (file) => Buffer.from(file.originalname, 'latin1').toString('utf8');

const collectFiles = (req) => {
	if (req.file) return [req.file];
	if (Array.isArray(req.files)) return req.files;
	if (req.files && typeof req.files === 'object') return Object.values(req.files).flat();
	return [];
};

const removeFiles = (files) =>
	Promise.all(files.filter((f) => f.path).map((f) => fs.unlink(f.path).catch(() => {})));

const quotaPrecheck = (opts) => async (req, _res, next) => {
	const limit = quota.quotaBytes();
	if (!opts.quota || !limit || !req.user) return next();
	try {
		const incoming = Number(req.headers['content-length']) || 0;
		if ((await quota.used(req.user.id)) + incoming > limit) {
			return next(
				httpError(
					429,
					`Đã vượt hạn mức upload ${Math.round(limit / 1048576)}MB trong ngày của tài khoản. Vui lòng thử lại vào ngày mai hoặc liên hệ quản trị.`,
				),
			);
		}
	} catch {
		// Không đọc được hạn mức — không chặn (bước sau vẫn cộng dồn)
	}
	next();
};

const verify = (opts) => async (req, _res, next) => {
	const files = collectFiles(req);
	if (!files.length) return next();

	for (const file of files) {
		const ext = path.extname(file.originalname).toLowerCase();
		let head;
		try {
			head = await readHead(file);
		} catch (err) {
			await removeFiles(files);
			return next(err);
		}
		if (!matchesExtension(ext, head)) {
			await removeFiles(files);
			return next(
				httpError(
					400,
					`File "${displayName(file)}" có nội dung không đúng định dạng ${ext || '(không có đuôi)'}.`,
				),
			);
		}
	}

	for (const file of files) {
		let result;
		try {
			result = await clamav.scanFile(file);
		} catch (err) {
			logger.error('[upload] ClamAV lỗi — từ chối upload:', err.message);
			await removeFiles(files);
			return next(
				httpError(503, 'Hệ thống quét virus tạm thời không hoạt động, vui lòng thử lại sau.'),
			);
		}
		if (result.clean === false) {
			await removeFiles(files);
			await securityEvents
				.log({
					eventType: 'upload_malware_blocked',
					actorId: req.user?.id ?? null,
					targetType: 'file',
					targetId: null,
					ip: req.ip,
					detail: `Chặn file "${displayName(file)}" — ClamAV: ${result.virus}`,
				})
				.catch(() => {});
			return next(
				httpError(422, `File "${displayName(file)}" bị phát hiện chứa mã độc và đã bị từ chối.`),
			);
		}
	}

	if (opts.quota && req.user) {
		const total = files.reduce((sum, f) => sum + (f.size || f.buffer?.length || 0), 0);
		await quota.add(req.user.id, total).catch(() => {});
	}
	next();
};

const secureUpload = (multerInstance, { quota: withQuota = true } = {}) => {
	const opts = { quota: withQuota };
	const wrap = (mw) => [quotaPrecheck(opts), mw, verify(opts)];
	return {
		single: (name) => wrap(multerInstance.single(name)),
		array: (name, maxCount) => wrap(multerInstance.array(name, maxCount)),
		fields: (spec) => wrap(multerInstance.fields(spec)),
	};
};

module.exports = { secureUpload };
