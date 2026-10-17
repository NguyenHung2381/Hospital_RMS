// Lỗi nghiệp vụ kèm mã HTTP. errorHandler trả đúng mã + message cho client
// (mã < 500 = thông điệp an toàn để hiển thị). Luôn là Error thật (có stack),
// không ném object thường. extra: trường thêm cho client/log (reasons, code...).
const httpError = (statusCode, message, extra) => Object.assign(new Error(message), { statusCode, ...extra });

const badRequest = (message, extra) => httpError(400, message, extra);
const forbidden = (message = 'Truy cập bị từ chối', extra) => httpError(403, message, extra);
const notFound = (message = 'Không tìm thấy dữ liệu', extra) => httpError(404, message, extra);
const conflict = (message, extra) => httpError(409, message, extra);

module.exports = { httpError, badRequest, forbidden, notFound, conflict };
