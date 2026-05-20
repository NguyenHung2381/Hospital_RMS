const { validationResult } = require('express-validator');
const { error } = require('../utils/response');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, 'Dữ liệu đầu vào không hợp lệ', 400, errors.array());
  }
  next();
};

const errorHandler = (err, req, res, next) => {
  console.error('❌ Error:', err.message);

  // SQL Server errors
  if (err.number) {
    if (err.number === 2627 || err.number === 2601) {
      return error(res, 'Dữ liệu đã tồn tại (vi phạm ràng buộc unique)', 409);
    }
    return error(res, err.message || 'Lỗi cơ sở dữ liệu', 500);
  }

  return error(res, err.message || 'Lỗi server nội bộ', err.statusCode || 500);
};

module.exports = { validate, errorHandler };
