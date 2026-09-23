const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Nạp biến môi trường dựa trên NODE_ENV. File .env nên nằm ở thư mục gốc của
// server (cạnh .env.example và docker-compose). Vẫn hỗ trợ src/.env để không
// vỡ nếu file bị đặt nhầm chỗ. dotenv KHÔNG ghi đè biến đã có sẵn, nên thứ tự
// dưới đây chính là thứ tự ưu tiên.
const SERVER_DIR = path.resolve(__dirname, '..');
const envFile =
	process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
const envCandidates = [
	path.resolve(SERVER_DIR, envFile),
	path.resolve(SERVER_DIR, '.env'),
	path.resolve(__dirname, envFile),
	path.resolve(__dirname, '.env'),
];
for (const envPath of envCandidates) {
	if (fs.existsSync(envPath)) {
		dotenv.config({ path: envPath });
	}
}

// Bắt buộc phải có các biến môi trường nhạy cảm — không cho phép fail-open
// bằng giá trị mặc định đoán được (vd 'admin'/'123'/'secret').
const REQUIRED_ENV = [
	'DB_USER',
	'DB_PASSWORD',
	'JWT_SECRET',
	'JWT_REFRESH_SECRET',
	'SWAGGER_USER',
	'SWAGGER_PASS',
];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
	console.error(
		`❌ Thiếu biến môi trường bắt buộc: ${missingEnv.join(', ')}. Xem server/.env.example.`,
	);
	process.exit(1);
}

// Ở production, không cho phép CORS mở cho mọi origin bằng cách im lặng quên
// set biến — bắt buộc khai báo rõ domain được phép, cùng nguyên tắc fail-closed
// như JWT_SECRET/DB_PASSWORD ở trên.
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
	console.error(
		'❌ Thiếu biến môi trường CORS_ORIGIN ở production. Xem server/.env.example.',
	);
	process.exit(1);
}

// Cảnh báo (không chặn khởi động — cần thời gian để hạ tầng/DBA xử lý) 2 rủi
// ro cấu hình DB phổ biến khi lên production:
//   - Kết nối không mã hoá: dữ liệu (kể cả password hash, token) truyền giữa
//     app và SQL Server ở dạng plaintext trên mạng.
//   - Dùng tài khoản 'sa': lộ credential này (vd qua log, .env rò rỉ) là mất
//     toàn quyền CẢ INSTANCE SQL Server, không chỉ riêng DB RMS_HOSPITAL.
//     Nên tạo login riêng, chỉ cấp quyền trên DB này (db_datareader/writer +
//     EXECUTE trên các sp_* mà app dùng).
if (process.env.NODE_ENV === 'production') {
	if (process.env.DB_ENCRYPT !== 'true') {
		console.warn(
			'⚠️  DB_ENCRYPT khác "true" ở production — kết nối tới SQL Server không được mã hoá.',
		);
	}
	if ((process.env.DB_USER || '').toLowerCase() === 'sa') {
		console.warn(
			'⚠️  DB_USER=sa ở production — nên dùng 1 SQL login riêng, chỉ cấp quyền trên DB RMS_HOSPITAL.',
		);
	}
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { errorHandler } = require('./middlewares/errorHandler');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const swaggerAuth = require('./middlewares/swaggerAuth');
const activityLogger = require('./middlewares/activityLogger');

const app = express();

// Số hop reverse-proxy đứng trước server (Nginx/IIS ARR/LB...) — bắt buộc set
// đúng khi deploy sau proxy, nếu không req.ip luôn là IP của proxy khiến
// rate-limit/khoá tài khoản theo IP mất tác dụng (coi mọi client là 1 IP),
// hoặc bị giả mạo qua X-Forwarded-For nếu set sai. Không set = giữ hành vi
// mặc định cũ của Express (không tin proxy nào, dùng IP kết nối trực tiếp).
if (process.env.TRUST_PROXY) {
	const raw = process.env.TRUST_PROXY;
	// "1", "2"... = số hop (Express cần kiểu number, không phải string, để hiểu
	// là hop count thay vì một địa chỉ IP tên "1"). Giá trị khác (IP/CIDR/
	// 'loopback'/danh sách phân tách bởi dấu phẩy) giữ nguyên dạng string.
	app.set('trust proxy', /^\d+$/.test(raw) ? Number(raw) : raw);
}

// ─── Middlewares ─────────────────────────────────────────────────────────────
// Header bảo mật (X-Frame-Options, X-Content-Type-Options, HSTS...). Tắt CSP
// mặc định của helmet vì /api-docs (Swagger UI) cần inline style/script mà
// một CSP mặc định sẽ chặn; API JSON thuần không cần CSP để tự bảo vệ.
app.use(helmet({ contentSecurityPolicy: false }));

// CORS_ORIGIN không set = cho phép mọi origin (hành vi mặc định cũ, không đổi).
// Set CORS_ORIGIN (phân cách bởi dấu phẩy) để giới hạn origin được phép gọi API.
const corsOrigins = process.env.CORS_ORIGIN
	? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
	: true;
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Static uploads ───────────────────────────────────────────────────────────
const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_DIR || 'uploads');
app.use('/uploads', express.static(UPLOADS_ROOT));

// ─── Health check ─────────────────────────────────────────────────────────────
app.use('/health', require('./routes/health'));

// ─── Swagger UI (chỉ admin mới truy cập được) ────────────────────────────────
// Basic Auth không có khoá tài khoản như /auth/login — chặn brute-force
// SWAGGER_PASS bằng rate-limit theo IP.
const swaggerLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 20,
	standardHeaders: true,
	legacyHeaders: false,
	message: 'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau ít phút.',
});
app.use(
	'/api-docs',
	swaggerLimiter,
	swaggerAuth,
	swaggerUi.serve,
	swaggerUi.setup(swaggerSpec, {
		customSiteTitle: 'RMS Hospital API Docs',
		swaggerOptions: {
			persistAuthorization: true, // giữ token sau khi reload
			docExpansion: 'none', // đóng gọn tất cả endpoint mặc định
			filter: true, // ô tìm kiếm endpoint
		},
	}),
);

// ─── Routes ───────────────────────────────────────────────────────────────────
const API = '/api/v1';

app.use(API, (req, res, next) => {
	res.set(
		'Cache-Control',
		'no-store, no-cache, must-revalidate, proxy-revalidate',
	);
	res.set('Pragma', 'no-cache');
	res.set('Expires', '0');
	next();
});

app.use(API, activityLogger);

app.use(`${API}/auth`, require('./routes/auth'));
app.use(`${API}/users`, require('./routes/users'));
app.use(`${API}/topics`, require('./routes/topics'));
app.use(`${API}/councils`, require('./routes/councils'));
app.use(`${API}/files`, require('./routes/files'));
app.use(`${API}/dashboard`, require('./routes/dashboard'));
app.use(`${API}/notifications`, require('./routes/notifications'));
app.use(`${API}/events`, require('./routes/events'));
app.use(`${API}/activity-logs`, require('./routes/activityLogs'));
app.use(`${API}/security-events`, require('./routes/securityEvents'));
app.use(`${API}/seminars`, require('./routes/seminars'));
app.use(`${API}/cme-records`, require('./routes/cmeRecords'));
app.use(`${API}/trainees`, require('./routes/trainees'));
app.use(`${API}/training-programs`, require('./routes/trainingPrograms'));
app.use(`${API}/lecturers`, require('./routes/lecturers'));
app.use(`${API}/courses`, require('./routes/courses'));
app.use(`${API}/staff-licenses`, require('./routes/staffLicenses'));
app.use(`${API}/system-settings`, require('./routes/systemSettings'));
app.use(`${API}/persons`, require('./routes/persons'));
app.use(`${API}/public`, require('./routes/public'));
app.use(API, require('./routes/lookups'));

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
	res.status(404).json({
		success: false,
		message: `Route ${req.method} ${req.path} không tồn tại`,
	});
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
