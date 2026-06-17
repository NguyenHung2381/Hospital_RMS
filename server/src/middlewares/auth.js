const jwt = require('jsonwebtoken');
const { unauthorized } = require('../utils/response');

const authenticate = (req, res, next) => {
	const authHeader = req.headers['authorization'];
	const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

	if (!token) return unauthorized(res, 'Token không được cung cấp');

	try {
		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		if (
			decoded.account_expires_at &&
			new Date(decoded.account_expires_at) < new Date()
		) {
			return unauthorized(
				res,
				'Tài khoản đã hết hạn sử dụng (đợt nghiên cứu đã kết thúc)',
			);
		}
		req.user = decoded; // { id, username, role_id, account_type, account_expires_at }
		next();
	} catch (err) {
		if (err.name === 'TokenExpiredError')
			return unauthorized(res, 'Token đã hết hạn');
		return unauthorized(res, 'Token không hợp lệ');
	}
};

const authorize = (...roles) => {
	return (req, res, next) => {
		if (!roles.includes(req.user?.account_type)) {
			return res.status(403).json({
				success: false,
				message: 'Không đủ quyền thực hiện thao tác này',
			});
		}
		next();
	};
};

module.exports = { authenticate, authorize };
