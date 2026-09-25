// Refresh token nằm trong cookie HttpOnly thay vì localStorage: JavaScript của
// trang (kể cả mã độc chèn qua lỗ XSS) không đọc được, nên không đánh cắp được
// phiên dài hạn. Access token vẫn do client giữ nhưng chỉ sống 15 phút.
//
//   HttpOnly           — JS không đọc được
//   Secure             — chỉ gửi qua HTTPS (tắt ở dev http://localhost)
//   SameSite=Strict    — trang web khác không kích hoạt gửi cookie (chống CSRF)
//   Path=/api/v1/auth  — chỉ gửi kèm các API refresh / logout, không đi theo
//                        mọi request
const REFRESH_COOKIE = 'rms_rt';
const COOKIE_PATH = '/api/v1/auth';
const REMEMBER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // khớp sp_create_refresh_token (30 ngày)

// Production luôn Secure (fail-closed, không suy từ req.secure vì chuỗi proxy
// cấu hình sai sẽ âm thầm làm mất cờ). Ghi đè bằng COOKIE_SECURE=true|false.
const cookieSecure = () =>
	process.env.COOKIE_SECURE
		? process.env.COOKIE_SECURE === 'true'
		: process.env.NODE_ENV === 'production';

const baseOptions = () => ({
	httpOnly: true,
	secure: cookieSecure(),
	sameSite: 'strict',
	path: COOKIE_PATH,
});

// remember = "Ghi nhớ đăng nhập": cookie sống 30 ngày qua lần đóng trình duyệt;
// ngược lại là cookie phiên (mất khi đóng trình duyệt, server vẫn giới hạn 7 ngày).
const setRefreshCookie = (res, token, remember) => {
	res.cookie(REFRESH_COOKIE, token, {
		...baseOptions(),
		...(remember ? { maxAge: REMEMBER_MAX_AGE_MS } : {}),
	});
};

const clearRefreshCookie = (res) => {
	res.clearCookie(REFRESH_COOKIE, baseOptions());
};

// Đọc cookie thủ công (1 cookie, không cần thêm thư viện cookie-parser).
const readRefreshCookie = (req) => {
	const header = req.headers.cookie;
	if (!header) return null;
	for (const part of header.split(';')) {
		const idx = part.indexOf('=');
		if (idx < 0) continue;
		if (part.slice(0, idx).trim() === REFRESH_COOKIE) {
			try {
				return decodeURIComponent(part.slice(idx + 1).trim()) || null;
			} catch {
				return null;
			}
		}
	}
	return null;
};

// Lớp chống CSRF thứ 2 (ngoài SameSite=Strict) cho các API dùng cookie: có
// header Origin thì phải thuộc CORS_ORIGIN. Không có Origin (điều hướng cùng
// trang, công cụ dòng lệnh) thì SameSite đã đủ. Dev không đặt CORS_ORIGIN = bỏ qua.
const isAllowedOrigin = (req) => {
	const origin = req.get('origin');
	if (!origin || !process.env.CORS_ORIGIN) return true;
	return process.env.CORS_ORIGIN.split(',')
		.map((o) => o.trim())
		.includes(origin);
};

module.exports = {
	REFRESH_COOKIE,
	setRefreshCookie,
	clearRefreshCookie,
	readRefreshCookie,
	isAllowedOrigin,
};
