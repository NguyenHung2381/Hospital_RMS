const path = require('path');
const dotenv = require('dotenv');

// Nạp biến môi trường dựa trên NODE_ENV
const envFile =
	process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
dotenv.config({ path: path.resolve(__dirname, envFile) });
// Fallback nạp thêm file .env mặc định nếu có những biến dùng chung chưa được định nghĩa trong file môi trường cụ thể
if (process.env.NODE_ENV === 'production') {
	dotenv.config({ path: path.resolve(__dirname, '.env') });
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

const express = require('express');
const cors = require('cors');
const { errorHandler } = require('./middlewares/errorHandler');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const swaggerAuth = require('./middlewares/swaggerAuth');
const activityLogger = require('./middlewares/activityLogger');

const app = express();

// ─── Middlewares ─────────────────────────────────────────────────────────────
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
app.use(
	'/api-docs',
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
app.use(`${API}/seminars`, require('./routes/seminars'));
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
