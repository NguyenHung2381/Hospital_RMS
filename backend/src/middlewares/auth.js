const jwt = require('jsonwebtoken');
const { unauthorized } = require('../utils/response');
const permCache = require('./permissionCache');
const userStatusCache = require('./userStatusCache');
const { isKnownKey } = require('../permissions/catalog');
const { scopeRank } = require('../permissions/scopes');

// Xác thực 2 lớp cho mọi API cần token:
//   Lớp 1 — JWT: chữ ký hợp lệ + chưa hết hạn (stateless, không biết được
//     việc xảy ra SAU khi token phát hành).
//   Lớp 2 — DB (qua cache 60s): tài khoản còn is_active=1, chưa quá
//     account_expires_at, kèm role_id/department_id HIỆN TẠI. Bắt
//     được trường hợp lớp 1 không thấy: admin vô hiệu hoá tài khoản sau khi
//     access token đã phát hành — access token cũ (sống tới 8h) sẽ bị chặn
//     trong vòng tối đa 60s thay vì tiếp tục dùng được tới hết hạn.
//     Kèm users.token_version: khác phiên bản trong token ⇒ phiên đã bị thu hồi.
//     Cố ý KHÔNG xét locked_until (khoá tạm do đăng nhập sai): nếu đá phiên
//     đang mở ra thì kẻ tấn công chỉ cần cố tình nhập sai mật khẩu là đẩy
//     được người dùng thật ra khỏi hệ thống. Khoá tạm chỉ chặn đăng nhập MỚI.
// Sau đó mới nạp tập quyền của vai trò vào req.user.permissions (+ phạm vi
// dữ liệu vào req.user.permissionScopes) qua permCache (cache 5 phút/role) nên
// tổng chi phí không đáng kể.
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

	// Token có "purpose" (pre-auth 2FA, QR điểm danh...) cũng ký bằng
	// JWT_SECRET nhưng KHÔNG phải access token — nếu nhận, pre-auth token (chỉ
	// cần mật khẩu) gọi được /auth/2fa/setup để ghi đè secret và tắt 2FA.
	if (decoded.purpose) return unauthorized(res, 'Token không hợp lệ');

	let status;
	try {
		status = await userStatusCache.load(decoded.id);
	} catch (err) {
		return next(err);
	}
	if (!status.isActive) {
		return unauthorized(res, 'Tài khoản đã bị vô hiệu hóa hoặc hết hạn sử dụng');
	}
	// users.token_version tăng (reset mật khẩu, đăng xuất mọi thiết bị, tự đổi
	// mật khẩu) ⇒ mọi access token phát hành trước đó hết hiệu lực NGAY, không
	// phải chờ tới hạn 8h. Token cũ không có `tv` được coi là phiên bản 0.
	if ((decoded.tv ?? 0) !== status.tokenVersion) {
		return unauthorized(res, 'Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại');
	}
	if (status.accountExpiresAt && new Date(status.accountExpiresAt) < new Date()) {
		return unauthorized(
			res,
			'Tài khoản đã hết hạn sử dụng (đợt nghiên cứu đã kết thúc)',
		);
	}

	// Các field quyết định phân quyền lấy từ DB (userStatusCache), đè lên giá
	// trị trong JWT — đổi vai trò / khoa có hiệu lực ngay, không chờ token hết hạn.
	req.user = {
		...decoded,
		role_id: status.roleId,
		department_id: status.departmentId,
		account_expires_at: status.accountExpiresAt,
	};
	try {
		const perms = status.roleId
			? await permCache.load(status.roleId)
			: { keys: new Set(), scopes: new Map() };
		req.user.permissions = perms.keys; // Set<"resource:action">
		req.user.permissionScopes = perms.scopes; // Map<"resource:action", scope>
	} catch (err) {
		return next(err);
	}
	next();
};

// Có ĐÚNG quyền "resource:action" (hoặc là superuser). "manage" không còn là
// wildcard — xem permissions/catalog.js.
const hasPermission = (user, resource, action) => {
	const perms = user?.permissions;
	if (!perms) return false;
	return perms.has('system:manage') || perms.has(`${resource}:${action}`);
};

// Phạm vi dữ liệu của actor trên một resource có phạm vi (permissions/scopes.js):
//   topics:  'own' | 'department' | 'all'
//   users:   'department' | 'all'
//   courses: 'assigned' | 'all'
// Lấy theo lượt cấp quyền `resource:action` (mặc định action 'read' — phạm vi
// XEM, quyết định danh sách/chi tiết thấy được). Không có quyền đó → phạm vi
// rộng nhất trong các quyền khác của resource; không có quyền nào → null.
const scopeOf = (user, resource, action = 'read') => {
	const perms = user?.permissions;
	if (!perms) return null;
	if (perms.has('system:manage')) return 'all';
	const scopes = user.permissionScopes;
	const direct = scopes?.get(`${resource}:${action}`);
	if (direct) return direct;
	let best = null;
	for (const [key, scope] of scopes ?? []) {
		if (!key.startsWith(`${resource}:`)) continue;
		if (best === null || scopeRank(resource, scope) > scopeRank(resource, best)) best = scope;
	}
	return best;
};

// Chỉ thấy đề tài mình tham gia ⇒ bị chặn theo mốc thời gian (deadline) của đợt.
const isDeadlineBound = (user) => (scopeOf(user, 'topics') ?? 'own') === 'own';

// Kiểm tra phân quyền theo resource:action từ bảng role_permissions.
// Quyền 'system:manage' bỏ qua mọi kiểm tra (superuser).
// Hỗ trợ nhiều cặp [resource, action]: người dùng chỉ cần có ít nhất một.
const authorizePermission = (...pairs) => {
	// Quyền không có trong catalog = gõ sai hoặc quên khai báo → route luôn 403
	// với mọi người trừ superuser. Báo ngay lúc nạp route thay vì đợi người dùng.
	for (const [resource, action] of pairs) {
		if (!isKnownKey(`${resource}:${action}`)) {
			console.warn(
				`⚠️  [permissions] authorizePermission dùng quyền không có trong catalog: ${resource}:${action}`,
			);
		}
	}
	const middleware = (req, res, next) => {
		const perms = req.user?.permissions;
		if (perms?.has('system:manage')) return next();

		const ok = perms && pairs.some(([resource, action]) => perms.has(`${resource}:${action}`));
		if (ok) return next();
		return res.status(403).json({
			success: false,
			message: 'Không đủ quyền thực hiện thao tác này',
		});
	};
	// Cho scripts/check-route-permissions.js đọc được route cần quyền gì.
	middleware.permissionPairs = pairs;
	return middleware;
};

module.exports = {
	authenticate,
	authorizePermission,
	hasPermission,
	scopeOf,
	isDeadlineBound,
};
