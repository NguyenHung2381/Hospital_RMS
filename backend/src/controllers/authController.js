const authService = require('../services/authService');
const loginShield = require('../utils/loginShield');
const { success, error } = require('../utils/response');
const {
	setRefreshCookie,
	clearRefreshCookie,
	readRefreshCookie,
	isAllowedOrigin,
} = require('../utils/authCookie');

// Refresh token chỉ đi qua cookie HttpOnly (utils/authCookie.js) — tách khỏi
// dữ liệu trả về để không bao giờ nằm trong body JSON (JS đọc được).
const withRefreshCookie = (res, data) => {
	const { refresh_token, remember, ...body } = data;
	if (refresh_token) setRefreshCookie(res, refresh_token, remember);
	return body;
};

// Refresh token của request: cookie trước; body chỉ còn để tương thích bản
// frontend cũ (lưu token trong localStorage) trong giai đoạn chuyển đổi.
const refreshTokenOf = (req) => readRefreshCookie(req) || req.body?.refresh_token || null;

const login = async (req, res, next) => {
	const { username, password, device_token, remember_me, pow_token, pow_nonce } = req.body;
	const userAgent = req.get('user-agent');
	try {
		// Lá chắn đăng nhập (utils/loginShield.js): đang có dấu hiệu dò thì phải
		// kèm lời giải thử thách hợp lệ — kiểm tra TRƯỚC khi truy vấn DB / bcrypt.
		const { bits } = await loginShield.assess({ ip: req.ip, username });
		if (
			bits > 0 &&
			!(await loginShield.verifyChallenge({
				token: pow_token,
				nonce: pow_nonce,
				username,
				requiredBits: bits,
			}))
		) {
			return res.status(428).json({
				success: false,
				code: 'LOGIN_CHALLENGE',
				message: 'Cần xác minh bảo mật trước khi đăng nhập',
				challenge: loginShield.issueChallenge({ username, bits }),
			});
		}

		let data;
		try {
			data = await authService.login(
				username,
				password,
				req.ip,
				userAgent,
				device_token,
				remember_me === true,
			);
		} catch (err) {
			// Sai tài khoản/mật khẩu (401) hoặc bị khoá tạm (kèm retryAfterSeconds)
			// = 1 lần dò. Lỗi khác (503 quá tải, 403 tài khoản vô hiệu hoá sau khi
			// ĐÚNG mật khẩu...) không tính.
			if (err?.statusCode === 401 || (err?.statusCode === 403 && err.retryAfterSeconds)) {
				await loginShield.recordFailure({ ip: req.ip, username, userAgent });
			}
			throw err;
		}
		await loginShield.recordSuccess({ username });
		return success(res, withRefreshCookie(res, data), 'Đăng nhập thành công');
	} catch (err) {
		next(err);
	}
};

const refresh = async (req, res, next) => {
	try {
		if (!isAllowedOrigin(req)) return error(res, 'Nguồn yêu cầu không hợp lệ', 403);
		const token = refreshTokenOf(req);
		if (!token) return error(res, 'Không có phiên đăng nhập để làm mới', 401);
		const data = await authService.refreshAccessToken(token, req.ip, req.get('user-agent'));
		return success(res, withRefreshCookie(res, data), 'Làm mới token thành công');
	} catch (err) {
		// Phiên hỏng thật (không phải 2 tab cùng làm mới) thì xoá cookie luôn
		if (err.statusCode === 401 && err.code !== 'REFRESH_RACE') clearRefreshCookie(res);
		if (err.code) {
			return res
				.status(err.statusCode || 500)
				.json({ success: false, code: err.code, message: err.message });
		}
		next(err);
	}
};

const logout = async (req, res, next) => {
	try {
		if (!isAllowedOrigin(req)) return error(res, 'Nguồn yêu cầu không hợp lệ', 403);
		await authService.logout(refreshTokenOf(req));
		clearRefreshCookie(res);
		return success(res, null, 'Đăng xuất thành công');
	} catch (err) {
		next(err);
	}
};

const logoutAll = async (req, res, next) => {
	try {
		await authService.logoutAll(req.user.id, req.ip);
		clearRefreshCookie(res);
		return success(res, null, 'Đã đăng xuất khỏi mọi thiết bị');
	} catch (err) {
		next(err);
	}
};

const sessions = async (req, res, next) => {
	try {
		const data = await authService.listSessions(req.user.id);
		return success(res, data);
	} catch (err) {
		next(err);
	}
};

const changePassword = async (req, res, next) => {
	try {
		const { old_password, new_password } = req.body;
		// Cấp phiên mới cho chính thiết bị này — mọi phiên khác vừa bị thu hồi.
		// Giữ lựa chọn "ghi nhớ đăng nhập" của phiên hiện tại.
		const remember = await authService.isRememberedSession(refreshTokenOf(req));
		const tokens = await authService.changePassword(
			req.user.id,
			old_password,
			new_password,
			req.ip,
			req.headers['user-agent'],
			remember,
		);
		return success(
			res,
			withRefreshCookie(res, tokens),
			'Đổi mật khẩu thành công. Các thiết bị khác đã bị đăng xuất.',
		);
	} catch (err) {
		next(err);
	}
};

const verify2FA = async (req, res, next) => {
	try {
		const { pre_auth_token, code, device_token } = req.body;
		const data = await authService.verify2FALogin(
			pre_auth_token,
			code,
			req.ip,
			req.get('user-agent'),
			device_token,
		);
		return success(res, withRefreshCookie(res, data), 'Đăng nhập thành công');
	} catch (err) {
		next(err);
	}
};

const setup2FA = async (req, res, next) => {
	try {
		const data = await authService.setup2FA(req.user.id);
		return success(res, data);
	} catch (err) {
		next(err);
	}
};

const verifySetup2FA = async (req, res, next) => {
	try {
		// Trả bộ mã khôi phục — chỉ hiển thị 1 lần này
		const data = await authService.confirm2FASetup(req.user.id, req.body.code);
		return success(res, data, 'Đã bật xác thực 2 lớp');
	} catch (err) {
		next(err);
	}
};

const regenerateBackupCodes = async (req, res, next) => {
	try {
		const data = await authService.regenerateBackupCodes(req.user.id, req.body.password);
		return success(res, data, 'Đã tạo bộ mã khôi phục mới');
	} catch (err) {
		next(err);
	}
};

const disable2FA = async (req, res, next) => {
	try {
		await authService.disable2FA(req.user.id, req.body.password);
		return success(res, null, 'Đã tắt xác thực 2 lớp');
	} catch (err) {
		next(err);
	}
};

const status2FA = async (req, res, next) => {
	try {
		const data = await authService.get2FAStatus(req.user.id);
		return success(res, data);
	} catch (err) {
		next(err);
	}
};

module.exports = {
	login,
	refresh,
	logout,
	logoutAll,
	sessions,
	changePassword,
	verify2FA,
	setup2FA,
	verifySetup2FA,
	regenerateBackupCodes,
	disable2FA,
	status2FA,
};
