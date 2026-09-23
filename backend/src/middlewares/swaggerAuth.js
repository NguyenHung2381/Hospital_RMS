const crypto = require('crypto');

/**
 * Middleware Basic Auth bảo vệ trang Swagger UI.
 * Đọc thông tin đăng nhập từ biến môi trường:
 *   SWAGGER_USER=admin
 *   SWAGGER_PASS=your_secret_password
 */

// So sánh 2 chuỗi bằng thời gian không đổi (không sớm trả false ở ký tự sai
// đầu tiên như ===) — chặn timing attack dò từng ký tự của SWAGGER_PASS.
// Hash trước bằng SHA-256 để luôn đưa vào timingSafeEqual 2 buffer cùng độ
// dài (bản thân hàm này throw nếu 2 buffer lệch độ dài).
const timingSafeStringEqual = (a, b) => {
	const bufA = crypto.createHash('sha256').update(String(a)).digest();
	const bufB = crypto.createHash('sha256').update(String(b)).digest();
	return crypto.timingSafeEqual(bufA, bufB);
};

const swaggerAuth = (req, res, next) => {
	// Bỏ qua xác thực nếu không phải môi trường production (tuỳ chọn)
	// if (process.env.NODE_ENV !== 'production') return next();

	const authHeader = req.headers['authorization'];

	if (!authHeader || !authHeader.startsWith('Basic ')) {
		res.set('WWW-Authenticate', 'Basic realm="Swagger Admin"');
		return res.status(401).send('Xác thực thất bại. Vui lòng đăng nhập.');
	}

	const base64 = authHeader.slice(6); // bỏ "Basic "
	const [user, pass] = Buffer.from(base64, 'base64').toString().split(':');

	const validUser = process.env.SWAGGER_USER;
	const validPass = process.env.SWAGGER_PASS;

	if (
		user &&
		pass &&
		timingSafeStringEqual(user, validUser) &&
		timingSafeStringEqual(pass, validPass)
	) {
		return next();
	}

	res.set('WWW-Authenticate', 'Basic realm="Swagger Admin"');
	return res.status(401).send('Sai tên đăng nhập hoặc mật khẩu.');
};

module.exports = swaggerAuth;
