require('./loadEnv');
const { z } = require('zod');

// Cấu hình hạ tầng đọc từ biến môi trường — kiểm tra 1 lần lúc khởi động
// (assertValidEnv, gọi ở app.js) thay vì rải điều kiện process.exit khắp nơi.
//   - Thiếu biến bắt buộc / vi phạm quy tắc production ⇒ lỗi, server DỪNG
//     (fail-closed, không chạy bằng giá trị mặc định đoán được).
//   - Biến tuỳ chọn sai định dạng (vd DB_POOL_MAX=abc) ⇒ cảnh báo, dùng mặc
//     định — giữ đúng hành vi cũ `Number(x) || mặc định`, nhưng không im lặng.
// Chỉ mô tả các biến của tầng hạ tầng (DB, JWT, HTTP, Redis). Biến riêng của
// từng tính năng vẫn đọc tại chỗ dùng (nhiều test đổi process.env lúc chạy);
// chuyển dần vào đây khi tách module. Danh sách đầy đủ + giải thích: .env.example.

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

// Cảnh báo của lần loadConfig đang chạy (helper optional ghi vào đây)
let warnings = [];

// Mỗi helper trả về (tên biến) => zod schema, để cảnh báo nêu đúng tên biến.
const optional = (schema, fallback, describe) => (key) =>
	z
		.preprocess(
			(v) => (isBlank(v) ? undefined : String(v).trim()),
			schema.optional().catch((ctx) => {
				warnings.push(
					`${key}=${JSON.stringify(ctx.input)} không hợp lệ (${describe}) — dùng mặc định ${JSON.stringify(fallback)}.`,
				);
				return undefined;
			}),
		)
		.transform((v) => v ?? fallback);

const int = (fallback, min = 1) =>
	optional(z.coerce.number().int().min(min), fallback, `số nguyên ≥ ${min}`);
const bool = (fallback) =>
	optional(
		z.enum(['true', 'false']).transform((v) => v === 'true'),
		fallback,
		'"true" hoặc "false"',
	);
const str =
	(fallback, transform = (v) => v) =>
	() =>
		z
			.preprocess((v) => (isBlank(v) ? undefined : String(v).trim()), z.string().optional())
			.transform((v) => transform(v ?? fallback));
const required = () =>
	z.preprocess(
		(v) => (isBlank(v) ? undefined : String(v)),
		z.string({ required_error: 'bắt buộc' }),
	);

const SPEC = {
	NODE_ENV: str('development'),
	PORT: int(3000),

	DB_SERVER: str('localhost'),
	DB_PORT: int(1433),
	DB_DATABASE: str('RMS_HOSPITAL'),
	DB_USER: required,
	DB_PASSWORD: required,
	DB_ENCRYPT: bool(false),
	DB_TRUST_SERVER_CERT: bool(true),
	DB_POOL_MAX: int(10),

	JWT_SECRET: required,
	JWT_REFRESH_SECRET: required,

	SWAGGER_ENABLED: bool(false),
	SWAGGER_USER: str(undefined),
	SWAGGER_PASS: str(undefined),

	// Danh sách origin phân cách dấu phẩy; bỏ trống = mọi origin (chỉ ở dev)
	CORS_ORIGIN: str(undefined, (v) =>
		v
			? v
					.split(',')
					.map((o) => o.trim())
					.filter(Boolean)
			: null,
	),
	// "1", "2"... = số hop (Express cần kiểu number); IP/CIDR/'loopback' giữ string
	TRUST_PROXY: str(undefined, (v) => (v && /^\d+$/.test(v) ? Number(v) : v)),
	API_RATE_LIMIT: int(1200),

	REDIS_HOST: str('localhost'),
	REDIS_PORT: int(6379),
	REDIS_PASSWORD: str(undefined),
};
const SCHEMAS = Object.fromEntries(Object.entries(SPEC).map(([key, make]) => [key, make(key)]));

// HS256 cần ≥ 256 bit entropy — script gen-jwt-secrets sinh 64 byte hex = 128 ký tự
const MIN_SECRET_LEN = 64;

// source: object biến môi trường (mặc định process.env). Không ném lỗi — trả
// { config, errors, warnings } để test được và để assertValidEnv quyết định.
const loadConfig = (source = process.env) => {
	warnings = [];
	// Parse từng biến riêng: thiếu 1 biến bắt buộc không làm mất giá trị/mặc
	// định của các biến còn lại.
	const errors = [];
	const raw = {};
	for (const [key, schema] of Object.entries(SCHEMAS)) {
		const r = schema.safeParse(source[key]);
		if (r.success) raw[key] = r.data;
		else errors.push(`${key}: ${r.error.issues.map((i) => i.message).join(', ')}`);
	}
	const isProduction = raw.NODE_ENV === 'production';

	// Swagger UI liệt kê toàn bộ API + cho gọi thử — tắt ở production, trừ khi
	// bật có chủ đích (SWAGGER_ENABLED=true, vd tạm thời khi tích hợp hệ thống khác).
	const swaggerEnabled = !isProduction || raw.SWAGGER_ENABLED === true;

	if (errors.length === 0) {
		if (swaggerEnabled) {
			for (const key of ['SWAGGER_USER', 'SWAGGER_PASS']) {
				if (!raw[key]) errors.push(`${key}: bắt buộc khi Swagger UI bật`);
			}
		}

		if (isProduction) {
			// 2 secret phải đủ dài và khác nhau: dùng chung thì lộ 1 là lộ cả access lẫn refresh token
			if (
				raw.JWT_SECRET.length < MIN_SECRET_LEN ||
				raw.JWT_REFRESH_SECRET.length < MIN_SECRET_LEN
			) {
				errors.push(
					`JWT_SECRET / JWT_REFRESH_SECRET phải dài ít nhất ${MIN_SECRET_LEN} ký tự ở production (npm run gen:jwt).`,
				);
			}
			if (raw.JWT_SECRET === raw.JWT_REFRESH_SECRET) {
				errors.push('JWT_SECRET và JWT_REFRESH_SECRET không được trùng nhau.');
			}
			// Không cho CORS mở mọi origin chỉ vì quên set biến ở production
			if (!raw.CORS_ORIGIN) errors.push('CORS_ORIGIN: bắt buộc ở production.');

			// Chỉ cảnh báo (hạ tầng/DBA cần thời gian xử lý):
			//   - Không mã hoá: password hash, token đi plaintext giữa app và SQL Server.
			//   - Tài khoản 'sa': lộ là mất toàn quyền CẢ INSTANCE, không chỉ DB này.
			if (!raw.DB_ENCRYPT) {
				warnings.push(
					'DB_ENCRYPT khác "true" ở production — kết nối tới SQL Server không được mã hoá.',
				);
			}
			if (raw.DB_USER.toLowerCase() === 'sa') {
				warnings.push(
					'DB_USER=sa ở production — nên dùng 1 SQL login riêng, chỉ cấp quyền trên DB RMS_HOSPITAL.',
				);
			}
		}
	}

	return {
		config: { ...raw, isProduction, swaggerEnabled },
		errors,
		warnings: [...warnings],
	};
};

const { config } = loadConfig();

// Gọi 1 lần lúc khởi động app: in cảnh báo, có lỗi thì dừng tiến trình; hợp lệ
// thì trả về config.
// Kiểm tra lại process.env TẠI LÚC GỌI — có thể đã được bổ sung sau khi file này nạp.
const assertValidEnv = () => {
	const { config: current, errors, warnings: found } = loadConfig();
	for (const w of found) console.warn(`⚠️  ${w}`);
	if (errors.length) {
		console.error(
			`❌ Cấu hình môi trường không hợp lệ (xem backend/.env.example):\n${errors.map((e) => `   - ${e}`).join('\n')}`,
		);
		process.exit(1);
	}
	return current;
};

module.exports = { config, loadConfig, assertValidEnv, MIN_SECRET_LEN };
