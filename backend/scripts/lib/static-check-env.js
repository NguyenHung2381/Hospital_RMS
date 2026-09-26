// Kiểm tra tĩnh (check-route-permissions.js, test/permissions/routeMatrix.test.js)
// chỉ nạp app.js để đọc danh sách route — không kết nối DB, không ký token thật.
// Nhưng app.js DỪNG tiến trình khi thiếu biến bắt buộc (DB, JWT...) nên trên
// máy không có .env (CI GitHub Actions, bản clone mới) 2 bước này luôn lỗi.
// Gọi SAU khi đã nạp .env: biến nào đã có (từ .env thật) giữ nguyên, chỉ điền
// giá trị giữ chỗ cho biến còn thiếu.
const REQUIRED = ['DB_USER', 'DB_PASSWORD', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'SWAGGER_USER', 'SWAGGER_PASS'];

for (const key of REQUIRED) {
	if (!process.env[key]) process.env[key] = `static-check-${key.toLowerCase()}`;
}
