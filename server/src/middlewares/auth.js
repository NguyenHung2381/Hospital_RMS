const jwt = require('jsonwebtoken');
const { unauthorized } = require('../utils/response');
const permCache = require('./permissionCache');

// Xác thực JWT + nạp tập quyền của vai trò vào req.user.permissions (Set "resource:action").
// Nạp qua permCache (cache 5 phút / role) nên chi phí không đáng kể.
const authenticate = async (req, res, next) => {
	const authHeader = req.headers['authorization'];
	const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

	if (!token) return unauthorized(res, 'Token không được cung cấp');

	let decoded;
	try {
		decoded = jwt.verify(token, process.env.JWT_SECRET);
	} catch (err) {
		if (err.name === 'TokenExpiredError')
			return unauthorized(res, 'Token đã hết hạn');
		return unauthorized(res, 'Token không hợp lệ');
	}

	if (
		decoded.account_expires_at &&
		new Date(decoded.account_expires_at) < new Date()
	) {
		return unauthorized(
			res,
			'Tài khoản đã hết hạn sử dụng (đợt nghiên cứu đã kết thúc)',
		);
	}

	req.user = decoded; // { id, username, role_id, account_expires_at }
	try {
		req.user.permissions = decoded.role_id
			? await permCache.load(decoded.role_id)
			: new Set();
	} catch (err) {
		return next(err);
	}
	next();
};

// Người dùng có quyền "resource:action" (hoặc "resource:manage", hoặc là superuser).
const hasPermission = (user, resource, action) => {
	const perms = user?.permissions;
	if (!perms) return false;
	return (
		perms.has('system:manage') ||
		perms.has(`${resource}:manage`) ||
		perms.has(`${resource}:${action}`)
	);
};

// Phạm vi dữ liệu đề tài / tài khoản mà vai trò được xem.
//   'all'        — xem toàn hệ thống (superuser hoặc *:read_all)
//   'department' — chỉ trong khoa của mình (*:read_department)
//   'own'        — chỉ dữ liệu liên quan trực tiếp tới mình
const scopeFor = (user, resource) => {
	const perms = user?.permissions;
	if (!perms) return 'own';
	if (perms.has('system:manage') || perms.has(`${resource}:read_all`))
		return 'all';
	if (perms.has(`${resource}:read_department`)) return 'department';
	return 'own';
};

const topicScope = (user) => scopeFor(user, 'topics');
const userScope = (user) => scopeFor(user, 'users');

// Bị chặn theo mốc thời gian (deadline) khi chỉ có phạm vi 'own'.
const isDeadlineBound = (user) => topicScope(user) === 'own';

// Kiểm tra phân quyền theo resource:action từ bảng role_permissions.
// Quyền 'system:manage' bỏ qua mọi kiểm tra (superuser).
// Quyền 'manage' của một resource cho phép mọi action trên resource đó.
// Hỗ trợ nhiều cặp [resource, action]: người dùng chỉ cần có ít nhất một.
const authorizePermission = (...pairs) => {
	return (req, res, next) => {
		const perms = req.user?.permissions;
		if (perms?.has('system:manage')) return next();

		const ok =
			perms &&
			pairs.some(
				([resource, action]) =>
					perms.has(`${resource}:${action}`) ||
					perms.has(`${resource}:manage`),
			);
		if (ok) return next();
		return res.status(403).json({
			success: false,
			message: 'Không đủ quyền thực hiện thao tác này',
		});
	};
};

module.exports = {
	authenticate,
	authorizePermission,
	hasPermission,
	topicScope,
	userScope,
	isDeadlineBound,
};
