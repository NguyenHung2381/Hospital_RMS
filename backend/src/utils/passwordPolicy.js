// Chính sách mật khẩu dùng chung cho MỌI nơi đặt mật khẩu: tự đổi mật khẩu,
// quản trị tạo tài khoản / đặt lại mật khẩu. Trước đây mỗi nơi một kiểu (5, 6
// hoặc 8 ký tự) nên quản trị đặt được mật khẩu yếu hơn người dùng tự đặt.
// Frontend có bản sao ở frontend/src/shared/utils/password.ts — sửa cả hai.
const MIN_LENGTH = 10;
const MAX_LENGTH = 128; // bcrypt chỉ dùng 72 byte đầu; chặn chuỗi quá dài gây tốn CPU

// Mật khẩu phổ biến nhất (đã đủ điều kiện độ dài + chữ + số) — kẻ tấn công
// luôn thử các mật khẩu này trước khi rải mật khẩu trên nhiều tài khoản.
const COMMON = new Set([
	'password123',
	'password1234',
	'password12345',
	'passw0rd123',
	'abcd123456',
	'abc1234567',
	'abc12345678',
	'qwerty123456',
	'qwerty12345',
	'qwe1234567',
	'a123456789',
	'a1234567890',
	'123456789a',
	'1234567890a',
	'12345678abc',
	'1qaz2wsx3edc',
	'1q2w3e4r5t',
	'q1w2e3r4t5',
	'zaq12wsxcde',
	'iloveyou123',
	'admin123456',
	'admin12345',
	'administrator1',
	'welcome123',
	'welcome2024',
	'welcome2025',
	'welcome2026',
	'hospital123',
	'benhvien123',
	'bvnghean123',
	'nghean12345',
	'matkhau123',
	'matkhau1234',
	'vietnam123',
	'vietnam1234',
	'hanoi123456',
	'saigon12345',
	'changeme123',
	'letmein1234',
	'test123456',
]);

// Trả về thông báo lỗi (string) nếu mật khẩu không đạt, ngược lại null.
const checkPassword = (password, { username } = {}) => {
	if (typeof password !== 'string' || !password) return 'Vui lòng nhập mật khẩu';
	if (password.length < MIN_LENGTH) return `Mật khẩu phải có ít nhất ${MIN_LENGTH} ký tự`;
	if (password.length > MAX_LENGTH) return `Mật khẩu không được dài quá ${MAX_LENGTH} ký tự`;
	if (!/[A-Za-z]/.test(password)) return 'Mật khẩu phải có ít nhất 1 chữ cái';
	if (!/[0-9]/.test(password)) return 'Mật khẩu phải có ít nhất 1 chữ số';
	const lower = password.toLowerCase();
	if (username && lower.includes(String(username).toLowerCase()))
		return 'Mật khẩu không được chứa tên đăng nhập';
	if (COMMON.has(lower)) return 'Mật khẩu quá phổ biến, vui lòng chọn mật khẩu khác';
	return null;
};

// Dùng trong express-validator: body('password').custom(passwordRule('username'))
// — usernameField là tên field chứa username trong body (nếu có).
const passwordRule =
	(usernameField) =>
	(value, { req }) => {
		const msg = checkPassword(value, {
			username: usernameField ? req.body?.[usernameField] : undefined,
		});
		if (msg) throw new Error(msg);
		return true;
	};

// Mật khẩu mặc định khi TẠO tài khoản mới hoặc quản trị ĐẶT LẠI mật khẩu = đúng
// tên đăng nhập. Không qua checkPassword (thường < 10 ký tự, chứa username) nên
// mọi luồng dùng nó phải đặt must_change_password = 1 để bắt đổi ở lần đăng nhập đầu.
const defaultPassword = (username) => String(username);

module.exports = { MIN_LENGTH, checkPassword, passwordRule, defaultPassword };
