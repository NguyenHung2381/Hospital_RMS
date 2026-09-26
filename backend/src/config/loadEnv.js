const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Nạp biến môi trường dựa trên NODE_ENV. File .env chỉ nằm ở thư mục gốc của
// server (cạnh .env.example và docker-compose) — KHÔNG đọc src/.env nữa: file
// đặt nhầm trong src/ từng bị đóng gói vào Docker image kèm mật khẩu DB và
// JWT_EXPIRES_IN=8h đè lên cấu hình production. dotenv KHÔNG ghi đè biến đã có
// sẵn, nên thứ tự dưới đây chính là thứ tự ưu tiên.
// Tách khỏi app.js để src/cluster.js (tiến trình primary) nạp được env mà
// không phải dựng cả Express app.
const SERVER_DIR = path.resolve(__dirname, '..', '..');
const envFile =
	process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
const envCandidates = [
	path.resolve(SERVER_DIR, envFile),
	path.resolve(SERVER_DIR, '.env'),
];
for (const envPath of envCandidates) {
	if (fs.existsSync(envPath)) {
		dotenv.config({ path: envPath });
	}
}
