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
	// SQL Server errors
	if (err.number) {
		console.error(
			`❌ SQL Error [${err.number}] on ${req.method} ${req.path}:`,
			err.message,
		);
		if (err.number === 2627 || err.number === 2601) {
			return error(res, 'Dữ liệu đã tồn tại (vi phạm ràng buộc unique)', 409);
		}
		if (err.number === 547) {
			return error(
				res,
				'Không thể thực hiện vì dữ liệu đang được liên kết ở nơi khác',
				409,
			);
		}
		return error(res, err.message || 'Lỗi cơ sở dữ liệu', 500);
	}

	console.error(`❌ Error on ${req.method} ${req.path}:`, err.message);
	return error(res, err.message || 'Lỗi server nội bộ', err.statusCode || 500);
};

module.exports = { validate, errorHandler };
