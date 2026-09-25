// Bản sao phía client của backend/src/utils/passwordPolicy.js — chỉ để báo lỗi
// sớm ngay trên form; server vẫn tự kiểm tra lại. Sửa cả hai nơi cùng lúc.
export const PASSWORD_MIN_LENGTH = 10;
const MAX_LENGTH = 128;

const COMMON = new Set([
	'password123', 'password1234', 'password12345', 'passw0rd123', 'abcd123456',
	'abc1234567', 'abc12345678', 'qwerty123456', 'qwerty12345', 'qwe1234567',
	'a123456789', 'a1234567890', '123456789a', '1234567890a', '12345678abc',
	'1qaz2wsx3edc', '1q2w3e4r5t', 'q1w2e3r4t5', 'zaq12wsxcde', 'iloveyou123',
	'admin123456', 'admin12345', 'administrator1', 'welcome123', 'welcome2024',
	'welcome2025', 'welcome2026', 'hospital123', 'benhvien123', 'bvnghean123',
	'nghean12345', 'matkhau123', 'matkhau1234', 'vietnam123', 'vietnam1234',
	'hanoi123456', 'saigon12345', 'changeme123', 'letmein1234', 'test123456',
]);

export const PASSWORD_HINT = `Ít nhất ${PASSWORD_MIN_LENGTH} ký tự, gồm cả chữ và số`;

// Trả về thông báo lỗi, hoặc null nếu mật khẩu đạt chuẩn.
export function checkPassword(password: string, username?: string): string | null {
	if (!password) return 'Vui lòng nhập mật khẩu';
	if (password.length < PASSWORD_MIN_LENGTH)
		return `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`;
	if (password.length > MAX_LENGTH) return `Mật khẩu không được dài quá ${MAX_LENGTH} ký tự`;
	if (!/[A-Za-z]/.test(password)) return 'Mật khẩu phải có ít nhất 1 chữ cái';
	if (!/[0-9]/.test(password)) return 'Mật khẩu phải có ít nhất 1 chữ số';
	const lower = password.toLowerCase();
	if (username && lower.includes(username.toLowerCase()))
		return 'Mật khẩu không được chứa tên đăng nhập';
	if (COMMON.has(lower)) return 'Mật khẩu quá phổ biến, vui lòng chọn mật khẩu khác';
	return null;
}

// Mật khẩu tạm ngẫu nhiên cho quản trị điền sẵn khi tạo tài khoản — người dùng
// phải đổi ở lần đăng nhập đầu. Bỏ ký tự dễ nhầm (0/O, 1/l/I).
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generateTempPassword(length = 12): string {
	for (;;) {
		const bytes = crypto.getRandomValues(new Uint32Array(length));
		const out = Array.from(bytes, (b) => TEMP_ALPHABET[b % TEMP_ALPHABET.length]).join('');
		if (!checkPassword(out)) return out;
	}
}
