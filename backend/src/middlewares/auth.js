const jwt = require('jsonwebtoken');
const { unauthorized } = require('../utils/response');
const permCache = require('./permissionCache');
const userStatusCache = require('./userStatusCache');

// Xác thực 2 lớp cho mọi API cần token:
//   Lớp 1 — JWT: chữ ký hợp lệ + chưa hết hạn (stateless, không biết được
//     việc xảy ra SAU khi token phát hành).
//   Lớp 2 — DB (qua cache 60s): tài khoản còn is_active=1 và không bị khoá
//     (locked_until) NGAY LÚC NÀY. Bắt được các trường hợp lớp 1 không thấy:
//     admin vô hiệu hoá/khoá tài khoản, hoặc tài khoản bị khoá do đăng nhập
//     sai sau khi access token đã phát hành — access token cũ (sống tới 8h)
//     sẽ bị chặn trong vòng tối đa 60s thay vì tiếp tục dùng được tới hết hạn.
// Sau đó mới nạp tập quyền của vai trò vào req.user.permissions (permCache,
// cache 5 phút/role) nên tổng chi phí không đáng kể.
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

	try {
		const status = await userStatusCache.load(decoded.id);
		if (!status.isActive) {
			return unauthorized(res, 'Tài khoản đã bị vô hiệu hóa hoặc hết hạn sử dụng');
		}
		if (status.lockedUntil && new Date(status.lockedUntil) > new Date()) {
			return unauthorized(res, 'Tài khoản đang bị tạm khoá');
		}
	} catch (err) {
		return next(err);
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

// Phạm vi khóa đào tạo — khác các resource khác ở chỗ 'courses:read' (phẳng,
// đã tồn tại từ trước) mặc nhiên coi là 'all' để KHÔNG đổi hành vi của các vai
// trò đang có quyền này. Chỉ khi actor có thêm 'courses:read_assigned' (và
// không có courses:read_all/manage) mới bị thu hẹp còn đúng khóa được phân
// công qua lecturer_assignments — vì vậy phải kiểm tra 'read_assigned' TRƯỚC
// khi rơi về nhánh flat 'read' ở dưới.
const courseScope = (user) => {
	const perms = user?.permissions;
	if (!perms) return 'own';
	if (
		perms.has('system:manage') ||
		perms.has('courses:manage') ||
		perms.has('courses:read_all')
	)
		return 'all';
	if (perms.has('courses:read_assigned')) return 'assigned';
	if (perms.has('courses:read')) return 'all';
	return 'own';
};

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
	courseScope,
	isDeadlineBound,
};
