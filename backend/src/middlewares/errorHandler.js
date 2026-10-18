const { validationResult } = require('express-validator');
const { error } = require('../utils/response');
const logger = require('../config/logger');

const validate = (req, res, next) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return error(res, 'Dữ liệu đầu vào không hợp lệ', 400, errors.array());
	}
	next();
};

const isProd = process.env.NODE_ENV === 'production';

const errorHandler = (err, req, res, next) => {
	// SQL Server errors — không trả nguyên văn err.message ra ngoài ở production
	// vì nó có thể lộ tên bảng/cột hoặc đoạn câu lệnh SQL; log đầy đủ ở server.
	if (err.number) {
		logger.error(`❌ SQL Error [${err.number}] on ${req.method} ${req.path}:`, err.message);
		if (err.number === 2627 || err.number === 2601) {
			if (/U[QX]_users_email/.test(err.message))
				return error(res, 'Email này đã được dùng cho tài khoản khác', 409);
			if (/UQ_stafflic_user/.test(err.message))
				return error(res, 'Nhân sự này đã có hồ sơ CCHN', 409);
			if (/UQ_stafflic_license_no/.test(err.message))
				return error(res, 'Số CCHN này đã gán cho nhân sự khác', 409);
			return error(res, 'Dữ liệu đã tồn tại (vi phạm ràng buộc unique)', 409);
		}
		if (err.number === 547) {
			return error(res, 'Không thể thực hiện vì dữ liệu đang được liên kết ở nơi khác', 409);
		}
		return error(res, isProd ? 'Lỗi cơ sở dữ liệu' : err.message || 'Lỗi cơ sở dữ liệu', 500);
	}

	logger.error(`❌ Error on ${req.method} ${req.path}:`, err.message);
	// Nhiều service ném lỗi nghiệp vụ chỉ kèm `status` (không có `statusCode`) —
	// trước đây rơi xuống 500 ("Lỗi server nội bộ"), kể cả lỗi từ chối quyền 403.
	const legacyStatus =
		Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : null;
	const statusCode = err.statusCode || legacyStatus || 500;
	// statusCode < 500 = lỗi nghiệp vụ chủ động ném ra (message an toàn để hiển
	// thị); >= 500 = lỗi không lường trước, ở production chỉ trả thông điệp
	// chung chung, tránh lộ stack/chi tiết nội bộ cho client.
	const message =
		statusCode < 500 || !isProd ? err.message || 'Lỗi server nội bộ' : 'Lỗi server nội bộ';
	// Lỗi khoá tạm (vd. đăng nhập sai nhiều lần) kèm số giây còn lại để client
	// hiển thị đồng hồ đếm ngược.
	if (err.retryAfterSeconds) {
		return res
			.status(statusCode)
			.json({ success: false, message, retry_after_seconds: err.retryAfterSeconds });
	}
	return error(res, message, statusCode);
};

module.exports = { validate, errorHandler };
