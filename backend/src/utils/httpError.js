const { isDbError } = require('./dbErrors');

// Lỗi nghiệp vụ kèm mã HTTP. errorHandler trả đúng mã + message cho client
// (mã < 500 = thông điệp an toàn để hiển thị). Luôn là Error thật (có stack),
// không ném object thường. extra: trường thêm cho client/log (reasons, code...).
const httpError = (statusCode, message, extra) =>
	Object.assign(new Error(message), { statusCode, ...extra });

const badRequest = (message, extra) => httpError(400, message, extra);
const forbidden = (message = 'Truy cập bị từ chối', extra) => httpError(403, message, extra);
const notFound = (message = 'Không tìm thấy dữ liệu', extra) => httpError(404, message, extra);
const conflict = (message, extra) => httpError(409, message, extra);

/**
 * Thông điệp của err đủ an toàn để hiện cho người dùng, không thì `fallback`.
 * Dùng ở chỗ tự bắt lỗi rồi trả lý do về client (vd. danh sách "bỏ qua" khi cấp
 * tài khoản hàng loạt) — không qua errorHandler nên phải tự lọc: lỗi CSDL
 * ('violates check constraint …') lộ tên bảng/ràng buộc, TypeError… lộ chi tiết code.
 * An toàn = httpError mã < 500, hoặc `new Error('…')` nghiệp vụ tự ném (lớp Error gốc).
 * @param {unknown} err
 * @param {string} [fallback]
 */
const publicMessage = (err, fallback = 'Lỗi hệ thống, vui lòng thử lại hoặc báo quản trị') => {
	if (!(err instanceof Error) || !err.message || isDbError(err)) return fallback;
	const status = /** @type {any} */ (err).statusCode;
	if (Number.isInteger(status)) return status < 500 ? err.message : fallback;
	return Object.getPrototypeOf(err) === Error.prototype ? err.message : fallback;
};

module.exports = { httpError, badRequest, forbidden, notFound, conflict, publicMessage };
