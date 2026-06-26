const jwt = require('jsonwebtoken');
const { unauthorized } = require('../utils/response');
const permCache = require('./permissionCache');

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

// Kiểm tra account_type (dùng cho các route đặc biệt không theo resource/action)
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

// Kiểm tra phân quyền theo resource:action từ bảng role_permissions.
// account_type='admin' bỏ qua mọi kiểm tra (superuser).
// Quyền 'manage' của một resource cho phép mọi action trên resource đó.
// Hỗ trợ nhiều cặp [resource, action]: người dùng chỉ cần có ít nhất một.
const authorizePermission = (...pairs) => {
	return async (req, res, next) => {
		if (req.user?.account_type === 'admin') return next();

		const roleId = req.user?.role_id;
		if (!roleId) {
			return res.status(403).json({
				success: false,
				message: 'Không đủ quyền thực hiện thao tác này',
			});
		}

		try {
			const perms = await permCache.load(roleId);
			const ok = pairs.some(([resource, action]) =>
				perms.has(`${resource}:${action}`) || perms.has(`${resource}:manage`),
			);
			if (ok) return next();
			return res.status(403).json({
				success: false,
				message: 'Không đủ quyền thực hiện thao tác này',
			});
		} catch (err) {
			return next(err);
		}
	};
};

module.exports = { authenticate, authorize, authorizePermission };
