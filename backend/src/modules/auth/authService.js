const { signToken } = require('../../utils/keys');
const { getPool, sql, nowSql } = require('../../config/db');
const { bumpTokenVersion } = require('./sessionVersion');
const { v4: uuidv4 } = require('uuid');
const trustedDevices = require('./trustedDeviceService');
const { httpError } = require('../../utils/httpError');
const {
	INVALID_CREDENTIALS,
	assertPassword,
	comparePassword,
	fakeCompareDelay,
	hashPassword,
	isLocked,
	isRepeatedWrongPassword,
	lockedError,
	loginAttemptKey,
	recordFailedLogin,
	refreshLockState,
	resetFailedLogins,
	userAttemptKey,
	withAttemptGuard,
} = require('./credentialService');
const { PRE_AUTH_2FA_TTL } = require('./twoFactorService');
const { issueTokens, signSession } = require('./sessionTokenService');
const tempPasswordPolicy = require('../../permissions/tempPasswordPolicy');
const securityEvents = require('../audit/securityEventService');

// remember = "Ghi nhớ đăng nhập": refresh token sống 30 ngày thay vì 7 ngày
// (sp_create_refresh_token) và cookie tồn tại qua lần đóng trình duyệt.
const login = async (
	username,
	password,
	ip = null,
	userAgent = null,
	deviceToken = null,
	remember = false,
) => {
	const pool = await getPool();

	// Có "@" → đăng nhập bằng email (username không bao giờ chứa "@"). users.email
	// chưa UNIQUE nên lấy 2 dòng: email dùng chung cho nhiều tài khoản thì không
	// biết là ai → coi như sai thông tin, người dùng phải đăng nhập bằng username.
	const byEmail = String(username).includes('@');
	const result = await pool.request().input('login', sql.VarChar(100), String(username).trim())
		.query(`
      SELECT u.id, u.username, u.password, u.full_name, u.email, u.staff_number,
             u.role_id, u.is_active, u.department_id,
             u.account_expires_at, u.failed_login_count, u.locked_until,
             u.totp_enabled, u.password_changed_at, u.must_change_password, u.twofa_required_since,
             u.temp_password_issued_at,
             r.name AS role_name, r.code AS role_code
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE ${byEmail ? 'u.email' : 'u.username'} = @login
      ORDER BY u.id OFFSET 0 ROWS FETCH NEXT 2 ROWS ONLY
    `);

	const user = result.recordset.length === 1 ? result.recordset[0] : null;
	if (!user) {
		// Cũng đi qua khóa lượt thử (theo chuỗi đăng nhập) như tài khoản thật bên
		// dưới — nhiều request cùng lúc cho 1 username bịa phải chờ y hệt.
		await withAttemptGuard(loginAttemptKey(username), fakeCompareDelay);
		throw INVALID_CREDENTIALS;
	}

	// Thiết bị quen không bị khóa tạm tài khoản chặn — kẻ tấn công cố tình nhập
	// sai từ máy khác không khóa được chủ tài khoản trên máy của họ.
	const device = await trustedDevices.verifyDeviceToken(deviceToken, user);

	const verifyPassword = async () => {
		if (!device) {
			await refreshLockState(pool, user);
			// Báo khóa TRƯỚC khi so mật khẩu (đánh đổi có chủ đích): nếu chỉ báo khóa
			// khi mật khẩu đúng, kẻ tấn công vẫn dò tiếp được trong thời gian khóa và
			// nhận ra mật khẩu đúng qua thông báo khác đi. Cái giá: lộ việc tài khoản
			// tồn tại — chỉ với tài khoản đang bị khóa.
			if (isLocked(user)) throw lockedError(user.locked_until);
		}

		const isMatch = await comparePassword(password, user.password);
		if (isMatch) return;
		if (!isRepeatedWrongPassword(user.id, password)) {
			if (device) {
				await trustedDevices.recordDeviceFailure(device, user, ip, 'sai mật khẩu');
			} else {
				const lockedUntil = await recordFailedLogin(pool, user, ip);
				// Lần sai làm khóa tài khoản → báo khóa ngay, không để người dùng
				// thử thêm lần nữa mới biết.
				if (lockedUntil) throw lockedError(lockedUntil);
			}
		}
		throw INVALID_CREDENTIALS;
	};
	// Thiết bị lạ: so mật khẩu dưới khóa lượt thử của tài khoản — loạt request
	// song song không vượt được ngưỡng khóa (credentialService.withAttemptGuard).
	// Thiết bị quen có bộ đếm riêng, không phải chờ kẻ đang dội tài khoản này.
	await (device ? verifyPassword() : withAttemptGuard(userAttemptKey(user.id), verifyPassword));

	// is_active = false bao gồm cả TK bị vô hiệu hóa thủ công lẫn TK hết hạn
	// (sp_deactivate_expired_accounts set is_active = false mỗi đêm). Chỉ báo SAU khi
	// mật khẩu đúng — người không biết mật khẩu không phân biệt được tài khoản
	// bị vô hiệu hóa với tài khoản không tồn tại.
	if (!user.is_active) throw httpError(403, 'Tài khoản đã bị vô hiệu hóa hoặc hết hạn sử dụng');

	// Mật khẩu tạm (thường = tên đăng nhập, dễ đoán) bỏ quên quá hạn mà chưa đổi:
	// không cho dùng nữa, kể cả khi đúng (permissions/tempPasswordPolicy.js). Báo
	// SAU khi mật khẩu đúng, như tài khoản bị vô hiệu hóa ở trên.
	if (
		await tempPasswordPolicy.isExpired({
			mustChangePassword: user.must_change_password,
			issuedAt: user.temp_password_issued_at,
		})
	) {
		await securityEvents.log({
			eventType: 'login_temp_password_expired',
			actorId: user.id,
			targetType: 'user',
			targetId: user.id,
			ip,
			userAgent,
			detail: 'Đăng nhập bằng mật khẩu tạm đã quá hạn — bị từ chối',
		});
		throw httpError(403, tempPasswordPolicy.EXPIRED_MESSAGE);
	}

	// Đăng nhập đúng trên thiết bị quen không xóa bộ đếm/khóa của thiết bị lạ
	// — nếu không, kẻ tấn công được làm lại từ đầu mỗi khi chủ tài khoản đăng
	// nhập. Bộ đếm của thiết bị quen được reset trong issueDeviceToken().
	if (!device) await resetFailedLogins(pool, user);

	// Tài khoản đã bật 2FA: dừng lại ở đây, KHÔNG phát token thật — chỉ trả 1
	// pre-auth token ngắn hạn để client gọi tiếp /auth/2fa/verify kèm mã OTP.
	if (user.totp_enabled) {
		// Khóa riêng 'pre-auth-2fa' (utils/keys.js): token này không bao giờ được
		// chấp nhận như access token. `rm` giữ lựa chọn "ghi nhớ" sang bước 2.
		const preAuthToken = signToken(
			'pre-auth-2fa',
			{ id: user.id, rm: remember ? 1 : 0, jti: uuidv4() },
			PRE_AUTH_2FA_TTL,
		);
		return { requires_2fa: true, pre_auth_token: preAuthToken };
	}

	return issueTokens(pool, user, ip, userAgent, device, remember);
};

// Tự đổi mật khẩu: đăng xuất MỌI phiên khác (thu hồi refresh token + tăng
// token_version), rồi cấp cặp token mới cho chính phiên đang đổi để người
// dùng không bị đá ra. Trả về { access_token, refresh_token } cho client lưu lại.
const changePassword = async (
	userId,
	oldPassword,
	newPassword,
	ip = null,
	userAgent = null,
	remember = false,
) => {
	const pool = await getPool();
	// Sai mật khẩu cũ tính vào bộ đếm khóa tài khoản (xem assertPassword)
	await assertPassword(pool, userId, oldPassword, { ip, message: 'Mật khẩu cũ không đúng' });
	// Mật khẩu tạm do quản trị cấp phải được thay thật sự, không "đổi" sang chính nó
	if (oldPassword === newPassword) throw httpError(400, 'Mật khẩu mới phải khác mật khẩu hiện tại');

	const hashed = await hashPassword(newPassword);
	await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.input('password', sql.VarChar(255), hashed)
		.query(
			`UPDATE users SET password = @password, password_changed_at = ${nowSql}, must_change_password = 'false',
			 temp_password_issued_at = NULL, updated_at = ${nowSql}, updated_by = @id WHERE id = @id`,
		);

	// Thu hồi mọi refresh token hiện có: đổi mật khẩu thường vì nghi lộ, nên
	// không để token cũ (nếu đã bị đánh cắp trước đó) tiếp tục dùng được.
	await pool
		.request()
		.input('user_id', sql.VarChar(20), userId)
		.query(`DELETE FROM refresh_tokens WHERE user_id = @user_id`);
	await bumpTokenVersion(userId, pool);

	const fresh = (
		await pool
			.request()
			.input('id', sql.VarChar(20), userId)
			.query('SELECT * FROM users WHERE id = @id')
	).recordset[0];
	const { accessToken, refreshToken } = await signSession(pool, fresh, ip, userAgent, { remember });
	return { access_token: accessToken, refresh_token: refreshToken, remember };
};

module.exports = {
	login,
	changePassword,
};
