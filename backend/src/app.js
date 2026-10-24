const path = require('path');
const logger = require('./config/logger');

// Kiểm tra biến môi trường trước mọi thứ khác: thiếu biến bắt buộc, secret
// production yếu, thiếu CORS_ORIGIN... thì dừng (config/env.js).
const config = require('./config/env').assertValidEnv();
const { requireModule } = require('./middlewares/moduleGuard');

const { isProduction, swaggerEnabled } = config;

const express = require('express');
const cors = require('cors');
// helmet là package ESM có bản CJS: require() trả về chính hàm, `.default` cũng là hàm đó
const helmet = require('helmet').default;
const rateLimit = require('./utils/rateLimit');
const { errorHandler } = require('./middlewares/errorHandler');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const swaggerAuth = require('./middlewares/swaggerAuth');
const activityLogger = require('./middlewares/activityLogger');
const { signUploadUrlsInJson, verifyUploadSignature } = require('./utils/signedUpload');

const app = express();

// Số hop reverse-proxy đứng trước server (Nginx/IIS ARR/LB...) — bắt buộc set
// đúng khi deploy sau proxy, nếu không req.ip luôn là IP của proxy khiến
// rate-limit/khoá tài khoản theo IP mất tác dụng (coi mọi client là 1 IP),
// hoặc bị giả mạo qua X-Forwarded-For nếu set sai. Không set = giữ hành vi
// mặc định cũ của Express (không tin proxy nào, dùng IP kết nối trực tiếp).
// config/env.js đã đổi "1", "2"... thành number (Express hiểu là số hop, không
// phải địa chỉ IP tên "1"); IP/CIDR/'loopback'/danh sách giữ dạng string.
if (config.TRUST_PROXY) app.set('trust proxy', config.TRUST_PROXY);

// ─── Middlewares ─────────────────────────────────────────────────────────────
// Header bảo mật (X-Frame-Options, X-Content-Type-Options, HSTS...). Tắt CSP
// mặc định của helmet vì /api-docs (Swagger UI) cần inline style/script mà
// một CSP mặc định sẽ chặn; API JSON thuần không cần CSP để tự bảo vệ.
app.use(helmet({ contentSecurityPolicy: false }));

// CORS_ORIGIN không set = cho phép mọi origin (hành vi mặc định cũ, không đổi).
// Set CORS_ORIGIN (phân cách bởi dấu phẩy) để giới hạn origin được phép gọi API.
const corsOrigins = config.CORS_ORIGIN ?? true;
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Static uploads ───────────────────────────────────────────────────────────
// Chỉ phục vụ link có chữ ký còn hạn — link được ký ở signUploadUrlsInJson
// khi API (đã qua kiểm tra quyền) trả đường dẫn file. Xem utils/signedUpload.js.
const { UPLOADS_ROOT } = require('./utils/uploadPaths');
// Chỉ ảnh / PDF / video / audio được mở thẳng trên trình duyệt (xem trước,
// <img>, <video>); còn lại (Office, zip, txt...) luôn tải xuống. File người dùng
// tải lên không bao giờ được chạy như trang web: CSP sandbox + không script.
// PDF không gắn CSP — trình xem PDF tích hợp của trình duyệt không chạy được
// dưới sandbox; nội dung PDF đã được kiểm tra đúng định dạng lúc upload.
const INLINE_UPLOAD_EXT = new Set([
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.webp',
	'.bmp',
	'.pdf',
	'.mp4',
	'.m4v',
	'.mov',
	'.webm',
	'.mkv',
	'.avi',
	'.mp3',
	'.wav',
	'.m4a',
	'.aac',
]);
const setUploadHeaders = (res, filePath) => {
	const ext = path.extname(filePath).toLowerCase();
	if (!INLINE_UPLOAD_EXT.has(ext)) res.setHeader('Content-Disposition', 'attachment');
	if (ext !== '.pdf') res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
};
app.use(
	'/uploads',
	verifyUploadSignature,
	express.static(UPLOADS_ROOT, {
		cacheControl: false,
		index: false,
		dotfiles: 'deny',
		setHeaders: setUploadHeaders,
	}),
);

// ─── Health check ─────────────────────────────────────────────────────────────
app.use('/health', require('./modules/system/health.routes'));

// ─── Swagger UI (chỉ admin mới truy cập được) ────────────────────────────────
// Basic Auth không có khoá tài khoản như /auth/login — chặn brute-force
// SWAGGER_PASS bằng rate-limit theo IP.
if (swaggerEnabled) {
	const swaggerLimiter = rateLimit({
		name: 'swagger',
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
}

// ─── Routes ───────────────────────────────────────────────────────────────────
const API = '/api/v1';

app.use(API, (req, res, next) => {
	res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
	res.set('Pragma', 'no-cache');
	res.set('Expires', '0');
	next();
});

// Production chạy sau reverse proxy HTTPS: request tới API mà không được báo là
// https (X-Forwarded-Proto qua nginx + TRUST_PROXY) nghĩa là chuỗi proxy cấu
// hình sai — các bước sau (cookie Secure...) sẽ hỏng âm thầm. Cảnh báo 1 lần.
if (isProduction) {
	let warnedInsecure = false;
	app.use(API, (req, _res, next) => {
		if (!warnedInsecure && !req.secure) {
			warnedInsecure = true;
			logger.warn(
				`⚠️  Request ${req.method} ${req.path} tới qua ${req.protocol}, không phải https — ` +
					'kiểm tra proxy HTTPS gửi X-Forwarded-Proto, TRUSTED_PROXIES (frontend) và TRUST_PROXY (backend).',
			);
		}
		next();
	});
}

// Báo cáo CSP từ trình duyệt — đặt trước activityLogger để không ghi vào nhật
// ký tác động của người dùng.
app.use(`${API}/csp-report`, require('./modules/system/cspReport.routes'));

// Giới hạn tổng theo IP cho mọi API — lưới an toàn phía sau limit_req của
// nginx (frontend/nginx.conf), chặn cả request gọi thẳng 127.0.0.1:3001 bỏ qua
// nginx. Đủ rộng cho người dùng thật (1200/phút = 20 req/s kéo dài); nhiều máy
// đi chung 1 IP NAT thì nâng API_RATE_LIMIT. Kết nối SSE /events sống lâu,
// đã có giới hạn riêng theo user (modules/events/events.routes.js) nên không tính ở đây.
app.use(
	API,
	rateLimit({
		name: 'api',
		windowMs: 60 * 1000,
		limit: config.API_RATE_LIMIT,
		standardHeaders: true,
		legacyHeaders: false,
		skip: (req) => req.method === 'GET' && req.path === '/events',
		message: { success: false, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.' },
	}),
);

// Ký link /uploads trước activityLogger để nhật ký không lưu chữ ký.
app.use(API, signUploadUrlsInJson);
app.use(API, activityLogger);

app.use(`${API}/modules`, require('./modules/system/modules.routes'));
app.use(`${API}/auth`, require('./modules/auth/auth.routes'));
app.use(`${API}/users`, require('./modules/users/users.routes'));
app.use(`${API}/topics`, requireModule('RESEARCH'), require('./modules/topics/topics.routes'));
app.use(
	`${API}/councils`,
	requireModule('RESEARCH'),
	require('./modules/councils/councils.routes'),
);
app.use(`${API}/files`, require('./modules/topics/files.routes'));
app.use(`${API}/excel`, require('./modules/system/excel.routes'));
app.use(`${API}/dashboard`, require('./modules/dashboard/dashboard.routes'));
app.use(`${API}/notifications`, require('./modules/notifications/notifications.routes'));
app.use(`${API}/events`, require('./modules/events/events.routes'));
app.use(`${API}/activity-logs`, require('./modules/audit/activityLogs.routes'));
app.use(`${API}/security-events`, require('./modules/audit/securityEvents.routes'));
app.use(`${API}/seminars`, requireModule('SEMINAR'), require('./modules/seminars/seminars.routes'));
app.use(`${API}/cme-records`, requireModule('SEMINAR'), require('./modules/cme/cmeRecords.routes'));
app.use(
	`${API}/trainees`,
	requireModule('TRAINING'),
	require('./modules/training/trainees/trainees.routes'),
);
app.use(
	`${API}/training-programs`,
	requireModule('TRAINING'),
	require('./modules/training/programs/trainingPrograms.routes'),
);
app.use(`${API}/surveys`, requireModule('SURVEY'), require('./modules/surveys/surveys.routes'));
app.use(`${API}/my-tasks`, require('./modules/portal/myTasks.routes'));
app.use(
	`${API}/me/teaching`,
	requireModule('TRAINING'),
	require('./modules/portal/teaching.routes'),
);
app.use(
	`${API}/me/mentoring`,
	requireModule('TRAINING'),
	require('./modules/portal/mentoring.routes'),
);
app.use(
	`${API}/me/trainee-documents`,
	requireModule('TRAINING'),
	require('./modules/portal/myTraineeDocuments.routes'),
);
app.use(`${API}/me`, require('./modules/portal/me.routes'));
app.use(
	`${API}/exams`,
	requireModule('TRAINING'),
	require('./modules/training/exams/exams.routes'),
);
app.use(`${API}/workflows`, require('./modules/topics/workflows.routes'));
app.use(
	`${API}/lecturers`,
	requireModule('TRAINING'),
	require('./modules/training/lecturers/lecturers.routes'),
);
app.use(
	`${API}/courses`,
	requireModule('TRAINING'),
	require('./modules/training/courses/courses.routes'),
);
app.use(`${API}/staff-licenses`, require('./modules/staffLicenses/staffLicenses.routes'));
app.use(
	`${API}/staff-attendance`,
	requireModule('ATTENDANCE'),
	require('./modules/attendance/staffAttendance.routes'),
);
app.use(`${API}/system-settings`, require('./modules/settings/systemSettings.routes'));
app.use(`${API}/persons`, require('./modules/persons/persons.routes'));
app.use(`${API}/public`, require('./modules/public/public.routes'));
app.use(API, require('./modules/catalog/catalog.routes'));
app.use(API, require('./modules/access/access.routes'));
app.use(API, require('./modules/rounds/rounds.routes'));

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
