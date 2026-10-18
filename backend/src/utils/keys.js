const crypto = require('crypto');

// Khoá ký riêng cho TỪNG loại token, dẫn xuất (HKDF-SHA256) từ JWT_SECRET.
// Trước đây access token, pre-auth 2FA, captcha, QR điểm danh, link /uploads...
// đều ký chung bằng JWT_SECRET — chỉ phân biệt nhau bằng claim `purpose`, nên
// quên kiểm tra purpose ở 1 chỗ là token loại này dùng được thay loại kia (vd
// token captcha đi qua được lớp verify của access token). Khoá khác nhau thì
// chữ ký của loại này không bao giờ hợp lệ với loại kia.
//
// Vẫn chỉ cần quản lý 1 secret: xoay JWT_SECRET (scripts/rotate-jwt-secrets.ps1)
// là mọi khoá dẫn xuất đổi theo.
const PURPOSES = new Set([
	'access', // access token phiên đăng nhập
	'pre-auth-2fa', // bước giữa mật khẩu và mã OTP
	'sse-ticket', // vé mở kết nối /events
	'captcha',
	'login-pow', // thử thách proof-of-work khi đăng nhập bị dội (utils/loginShield.js)
	'attendance-qr', // QR điểm danh buổi học
	'seminar-qr', // QR điểm danh hội thảo
	'upload-url', // chữ ký link /uploads (khi không đặt UPLOAD_URL_SECRET)
]);

const cache = new Map();

const keyFor = (purpose) => {
	if (!PURPOSES.has(purpose)) throw new Error(`[keys] mục đích khoá không xác định: ${purpose}`);
	let key = cache.get(purpose);
	if (!key) {
		key = Buffer.from(
			crypto.hkdfSync('sha256', process.env.JWT_SECRET, 'rms-hospital', `rms:${purpose}`, 32),
		);
		cache.set(purpose, key);
	}
	return key;
};

// Claim chung cho mọi JWT do API phát hành
const ISSUER = 'rms-hospital-api';

// Ký / xác minh JWT theo mục đích: khoá riêng + ghim thuật toán HS256 + iss/aud
// (aud = mục đích). verifyToken ném lỗi của jsonwebtoken nếu không hợp lệ.
const signToken = (purpose, payload, expiresIn) =>
	require('jsonwebtoken').sign(payload, keyFor(purpose), {
		algorithm: 'HS256',
		expiresIn,
		issuer: ISSUER,
		audience: purpose,
	});

// Payload luôn là object: mọi token loại này do chính API ký từ object.
const verifyToken = (purpose, token) =>
	/** @type {import('jsonwebtoken').JwtPayload} */ (
		require('jsonwebtoken').verify(token, keyFor(purpose), {
			algorithms: ['HS256'],
			issuer: ISSUER,
			audience: purpose,
		})
	);

// Cho test: xoá khoá đã dẫn xuất khi đổi JWT_SECRET trong cùng tiến trình
const reset = () => cache.clear();

module.exports = { keyFor, signToken, verifyToken, ISSUER, reset };
