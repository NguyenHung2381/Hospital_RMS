const jwt = require('jsonwebtoken');
const { signToken, ISSUER } = require('../../utils/keys');
const crypto = require('crypto');
const { getPool, sql } = require('../../config/db');
const permCache = require('../../permissions/permissionCache');
const { twoFactorState } = require('../../permissions/twoFactorPolicy');
const { currentTokenVersion, bumpTokenVersion } = require('./sessionVersion');
const { v4: uuidv4 } = require('uuid');
const securityEvents = require('../audit/securityEventService');
const trustedDevices = require('./trustedDeviceService');
const { httpError } = require('../../utils/httpError');
const logger = require('../../config/logger');

// refresh_tokens.token lưu HASH, không lưu JWT gốc — nếu DB bị lộ (backup,
// SQL injection, insider) thì token đọc được từ đó không dùng lại được ngay
// (khác với password, hash không cần salt/cost cao vì refresh token đã có
// entropy lớn sẵn, sha256 là đủ và tra cứu được bằng WHERE = trực tiếp).
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Access token sống ngắn (mặc định 15 phút, trước đây 8 giờ): lộ ra (XSS, log,
// máy dùng chung) thì chỉ dùng được ít phút; client tự làm mới bằng refresh
// token nằm trong cookie HttpOnly (utils/authCookie.js).
const ACCESS_TOKEN_TTL = () => process.env.JWT_EXPIRES_IN || '15m';

const signAccessToken = (user, tv) =>
	signToken(
		'access',
		{
			id: user.id,
			username: user.username,
			full_name: user.full_name,
			staff_number: user.staff_number ? String(user.staff_number) : null,
			role_id: user.role_id,
			department_id: user.department_id,
			account_expires_at: user.account_expires_at
				? new Date(user.account_expires_at).toISOString().split('T')[0]
				: null,
			tv,
		},
		ACCESS_TOKEN_TTL(),
	);

// Ký cặp access + refresh token và lưu refresh token (hash). Access token mang
// `tv` = users.token_version hiện tại (xem sessionVersion.js).
//   familyId: "họ" token — mọi refresh token sinh ra từ cùng 1 lần đăng nhập
//     (qua các lần xoay) cùng họ; phát hiện dùng lại thì thu hồi cả họ.
//     Không truyền = phiên mới (họ mới).
const signSession = async (
	pool,
	user,
	ip,
	userAgent,
	{ remember = false, familyId = null } = {},
) => {
	const accessToken = signAccessToken(user, await currentTokenVersion(user.id, pool));

	// jti ngẫu nhiên: payload chỉ có {id} + JWT iat chỉ chính xác tới giây, nên
	// 2 lần sign trong cùng 1 giây (không hiếm với round-trip DB nhanh) cho ra
	// CHUỖI TOKEN GIỐNG NHAU — phá vỡ bảo đảm "token cũ sau rotate bị từ chối".
	// Hạn JWT khớp hạn trong DB (sp_create_refresh_token: 30 ngày nếu ghi nhớ).
	const refreshToken = jwt.sign({ id: user.id, jti: uuidv4() }, process.env.JWT_REFRESH_SECRET, {
		algorithm: 'HS256',
		expiresIn: /** @type {import('jsonwebtoken').SignOptions['expiresIn']} */ (
			remember ? '30d' : process.env.JWT_REFRESH_EXPIRES_IN || '7d'
		),
		issuer: ISSUER,
		audience: 'refresh',
	});

	// Store refresh token via SP (handles id generation + remember_me)
	const created = await pool
		.request()
		.input('user_id', sql.VarChar(20), user.id)
		.input('token', sql.VarChar(64), hashToken(refreshToken))
		.input('remember_me', sql.Bit, remember ? 1 : 0)
		.execute('sp_create_refresh_token');

	await tagRefreshTokenSession(
		pool,
		hashToken(refreshToken),
		ip,
		userAgent,
		familyId || created.recordset?.[0]?.id || uuidv4(),
	);
	return { accessToken, refreshToken, remember: !!remember };
};

// Phát access/refresh token thật + device token (thiết bị quen) + trả về
// profile đầy đủ — dùng chung cho login() thường và verify2FALogin() (bước 2
// sau khi xác minh mã OTP). refresh_token + remember KHÔNG gửi cho client trong
// body — controller chuyển vào cookie HttpOnly.
const issueTokens = async (pool, user, ip, userAgent, device = null, remember = false) => {
	const { permissions, permission_scopes } = await loadPermissions(user.role_id);
	const { accessToken, refreshToken } = await signSession(pool, user, ip, userAgent, { remember });
	// Tài khoản quản trị chưa bật 2FA: 'grace' (nhắc, kèm hạn) hoặc 'required'
	// (quá hạn — client chuyển thẳng tới màn bật 2FA; server tự chặn API khác).
	const twoFa = await twoFactorState(
		{ userId: user.id, totpEnabled: !!user.totp_enabled, requiredSince: user.twofa_required_since },
		new Set(permissions),
	);

	return {
		user: {
			twofa_state: twoFa.state,
			twofa_deadline: twoFa.deadline ? twoFa.deadline.toISOString() : null,
			id: user.id,
			username: user.username,
			staff_number: user.staff_number ? String(user.staff_number) : null,
			full_name: user.full_name,
			email: user.email,
			role: user.role_name,
			role_code: user.role_code ?? null,
			role_id: user.role_id,
			department_id: user.department_id,
			permissions,
			permission_scopes,
			// Client chuyển thẳng tới màn đổi mật khẩu; server vẫn tự chặn
			// (middlewares/auth.js) nên cờ này chỉ để điều hướng.
			must_change_password: !!user.must_change_password,
		},
		access_token: accessToken,
		refresh_token: refreshToken,
		remember: !!remember,
		device_token: trustedDevices.issueDeviceToken(user, device),
	};
};

// Gắn IP/thiết bị vào dòng refresh_tokens vừa tạo — làm ở bước riêng (UPDATE
// sau INSERT) thay vì sửa sp_create_refresh_token, vì body của stored proc đó
// không nằm trong repo (thuộc schema nền chưa có migration gốc) nên không an
// toàn để CREATE OR ALTER lại mà không biết nó đang làm gì bên trong.
// `tokenHash` = hashToken(token gốc) — refresh_tokens.token lưu hash (xem hashToken).
// Lỗi ở đây chỉ ghi log: dòng thiếu family_id vẫn hoạt động (lúc xoay, id của
// chính dòng đó được dùng làm họ — xem refreshAccessToken).
const tagRefreshTokenSession = async (pool, tokenHash, ip, userAgent, familyId) => {
	try {
		await pool
			.request()
			.input('token', sql.VarChar(64), tokenHash)
			.input('ip_address', sql.VarChar(64), ip)
			.input('user_agent', sql.NVarChar(255), userAgent ? String(userAgent).slice(0, 255) : null)
			.input('family_id', sql.VarChar(60), familyId)
			.query(
				`UPDATE refresh_tokens SET ip_address = @ip_address, user_agent = @user_agent,
				   family_id = @family_id WHERE token = @token`,
			);
	} catch (err) {
		logger.error('❌ tagRefreshTokenSession failed:', err.message);
	}
};

// Quyền "resource:action" + phạm vi dữ liệu của một vai trò — trả về cho
// client để điều hướng / ẩn hiện menu. Backend vẫn tự kiểm tra qua permissionCache.
const loadPermissions = async (roleId) => {
	if (!roleId) return { permissions: [], permission_scopes: {} };
	const perms = await permCache.load(roleId);
	return {
		permissions: [...perms.keys],
		permission_scopes: Object.fromEntries(perms.scopes),
	};
};

// ─── Xoay refresh token + phát hiện dùng lại ────────────────────────────────
// Mỗi lần làm mới: token đang dùng bị đánh dấu thu hồi (revoked_at, KHÔNG xoá)
// và được thay bằng token mới cùng họ (family_id). Bước "nhận" token là 1 câu
// UPDATE nguyên tử — 2 request cùng mang 1 token thì chỉ 1 bên thắng (trước
// đây SELECT rồi mới DELETE nên cả 2 cùng qua được).
//
// Token ĐÃ thu hồi mà vẫn được dùng lại:
//   - trong REFRESH_RACE_GRACE_MS: gần như chắc chắn là 2 tab cùng làm mới —
//     báo REFRESH_RACE, client thử lại (cookie đã là token mới của tab kia);
//   - quá thời gian đó: token đã bị sao chép (đánh cắp) — kẻ tấn công hoặc chủ
//     tài khoản đang dùng bản cũ. Thu hồi cả họ token + mọi access token đang
//     lưu hành (token_version); thiết bị khác của người dùng (họ token khác)
//     tự làm mới lại được, còn kẻ tấn công mất phiên.
const REFRESH_RACE_GRACE_MS = 30 * 1000;

const invalidRefresh = () => httpError(401, 'Refresh token không hợp lệ hoặc đã hết hạn');

const refreshAccessToken = async (refreshToken, ip = null, userAgent = null) => {
	/** @type {import('jsonwebtoken').JwtPayload} payload luôn là object (token do API ký) */
	let decoded;
	try {
		// Chưa bắt buộc iss/aud: refresh token phát hành trước bản này không có
		// 2 claim đó (sống tới 30 ngày). Bảo đảm chính là dòng hash trong DB.
		decoded = /** @type {import('jsonwebtoken').JwtPayload} */ (
			jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] })
		);
	} catch {
		throw invalidRefresh();
	}

	const pool = await getPool();
	const tokenHash = hashToken(refreshToken);
	const claimed = (
		await pool.request().input('token', sql.VarChar(64), tokenHash).query(`
				UPDATE refresh_tokens SET revoked_at = SYSUTCDATETIME()
				OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.family_id, INSERTED.remember_me
				WHERE token = @token AND revoked_at IS NULL AND expires_at > GETDATE()
			`)
	).recordset[0];

	if (!claimed) {
		const prior = (
			await pool
				.request()
				.input('token', sql.VarChar(64), tokenHash)
				.query('SELECT id, user_id, family_id, revoked_at FROM refresh_tokens WHERE token = @token')
		).recordset[0];
		if (prior?.revoked_at) {
			if (Date.now() - new Date(prior.revoked_at).getTime() < REFRESH_RACE_GRACE_MS) {
				throw httpError(401, 'Phiên đang được làm mới ở tab khác, vui lòng thử lại', {
					code: 'REFRESH_RACE',
				});
			}
			await revokeFamily(pool, prior.family_id || prior.id, prior.user_id, ip);
		}
		throw invalidRefresh();
	}

	const userResult = await pool
		.request()
		.input('id', sql.VarChar(20), claimed.user_id)
		.query(
			`SELECT u.*, r.name AS role_name, r.code AS role_code FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.id=@id`,
		);

	const user = userResult.recordset[0];
	if (!user || user.id !== decoded.id) throw invalidRefresh();

	// Cùng điều kiện với login(): tài khoản bị vô hiệu hoá / hết hạn không được
	// làm mới phiên — token vừa bị thu hồi ở bước trên nên không thử lại được.
	const accountExpiresAt = user.account_expires_at
		? new Date(user.account_expires_at).toISOString().split('T')[0]
		: null;
	if (!user.is_active || (accountExpiresAt && new Date(accountExpiresAt) < new Date())) {
		throw httpError(401, 'Tài khoản đã bị vô hiệu hóa hoặc hết hạn sử dụng');
	}

	const remember = !!claimed.remember_me;
	const { accessToken, refreshToken: newRefreshToken } = await signSession(
		pool,
		user,
		ip,
		userAgent,
		{
			remember,
			// Dòng tạo trước khi có cột family_id: lấy id của chính nó làm họ
			familyId: claimed.family_id || claimed.id,
		},
	);

	return { access_token: accessToken, refresh_token: newRefreshToken, remember };
};

// Refresh token bị dùng lại sau khi đã xoay ⇒ coi như bị đánh cắp.
const revokeFamily = async (pool, familyId, userId, ip) => {
	await pool
		.request()
		.input('family', sql.VarChar(60), familyId)
		.query('DELETE FROM refresh_tokens WHERE family_id = @family OR id = @family');
	await bumpTokenVersion(userId, pool);
	await securityEvents.log({
		eventType: 'refresh_token_reuse',
		actorId: userId,
		targetType: 'user',
		targetId: userId,
		ip,
		detail: 'Refresh token đã thu hồi bị dùng lại — thu hồi cả phiên đăng nhập và mọi access token',
	});
};

// Đăng xuất phiên hiện tại: xoá cả họ token của phiên (kể cả các token đã xoay
// trước đó), không đụng tới phiên trên thiết bị khác.
const logout = async (refreshToken) => {
	if (!refreshToken) return;
	const pool = await getPool();
	await pool.request().input('token', sql.VarChar(64), hashToken(refreshToken)).query(`
			DECLARE @family VARCHAR(60) =
				(SELECT TOP 1 ISNULL(family_id, id) FROM refresh_tokens WHERE token = @token);
			DELETE FROM refresh_tokens WHERE token = @token OR family_id = @family OR id = @family;
		`);
};

// "Ghi nhớ đăng nhập" của phiên đang giữ refresh token này (để phiên cấp lại sau
// khi đổi mật khẩu giữ nguyên lựa chọn). Không tìm thấy = không ghi nhớ.
const isRememberedSession = async (refreshToken) => {
	if (!refreshToken) return false;
	const pool = await getPool();
	const row = (
		await pool
			.request()
			.input('token', sql.VarChar(64), hashToken(refreshToken))
			.query('SELECT remember_me FROM refresh_tokens WHERE token = @token')
	).recordset[0];
	return !!row?.remember_me;
};

// Đăng xuất khỏi mọi thiết bị: xoá toàn bộ refresh token của người dùng và
// tăng users.token_version để mọi access token đang lưu hành hết hiệu lực ngay.
const logoutAll = async (userId, actorIp = null) => {
	const pool = await getPool();
	await pool
		.request()
		.input('user_id', sql.VarChar(20), userId)
		.query(`DELETE FROM refresh_tokens WHERE user_id = @user_id`);
	// ...và thu hồi ngay mọi access token đang lưu hành (users.token_version)
	await bumpTokenVersion(userId, pool);

	await securityEvents.log({
		eventType: 'logout_all_sessions',
		actorId: userId,
		targetType: 'user',
		targetId: userId,
		ip: actorIp,
	});
};

// Liệt kê phiên đăng nhập đang hoạt động (mỗi refresh token còn hạn = 1 phiên).
// Dùng SELECT * + lọc lại field ở tầng JS: bảng refresh_tokens thuộc schema
// nền không có trong repo (không migration gốc) nên không chắc có cột nào
// ngoài token/expires_at/remember_me — tránh tham chiếu cột chưa xác nhận
// (vd created_at) để không vỡ query nếu cột đó không tồn tại.
const listSessions = async (userId) => {
	const pool = await getPool();
	const result = await pool.request().input('user_id', sql.VarChar(20), userId).query(`
			SELECT *
			FROM refresh_tokens
			WHERE user_id = @user_id AND expires_at > GETDATE() AND revoked_at IS NULL
			ORDER BY expires_at DESC
		`);
	return result.recordset.map((r) => ({
		id: r.id,
		ip_address: r.ip_address ?? null,
		user_agent: r.user_agent ?? null,
		created_at: r.created_at ?? null,
		expires_at: r.expires_at,
	}));
};

module.exports = {
	refreshAccessToken,
	logout,
	logoutAll,
	listSessions,
	isRememberedSession,
	issueTokens,
	signSession,
};
