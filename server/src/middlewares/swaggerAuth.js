/**
 * Middleware Basic Auth bảo vệ trang Swagger UI.
 * Đọc thông tin đăng nhập từ biến môi trường:
 *   SWAGGER_USER=admin
 *   SWAGGER_PASS=your_secret_password
 */
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

	const validUser = process.env.SWAGGER_USER || 'admin';
	const validPass = process.env.SWAGGER_PASS || 'admin123';

	if (user === validUser && pass === validPass) {
		return next();
	}

	res.set('WWW-Authenticate', 'Basic realm="Swagger Admin"');
	return res.status(401).send('Sai tên đăng nhập hoặc mật khẩu.');
};

module.exports = swaggerAuth;
