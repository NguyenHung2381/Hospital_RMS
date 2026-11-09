require('./loadEnv');
const fs = require('fs');
const { z } = require('zod');
const logger = require('./logger');

// Cấu hình hạ tầng đọc từ biến môi trường — kiểm tra 1 lần lúc khởi động
// (assertValidEnv, gọi ở app.js) thay vì rải điều kiện process.exit khắp nơi.
//   - Thiếu biến bắt buộc / vi phạm quy tắc production ⇒ lỗi, server DỪNG
//     (fail-closed, không chạy bằng giá trị mặc định đoán được).
//   - Biến tùy chọn sai định dạng (vd DB_POOL_MAX=abc) ⇒ cảnh báo, dùng mặc
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
	z.preprocess((v) => (isBlank(v) ? undefined : String(v)), z.string({ error: 'bắt buộc' }));

const SPEC = {
	NODE_ENV: str('development'),
	PORT: int(3001),

	// PostgreSQL. DB_ENCRYPT = dùng SSL, DB_CA_CERT_FILE = kiểm tra chứng chỉ (verify-full).
	DB_SERVER: str('localhost'),
	DB_PORT: int(5432),
	DB_DATABASE: str('rms_hospital'),
	DB_USER: required,
	// Được bỏ trống: driver đọc ~/.pgpass (hoặc file PGPASSFILE) hoặc PGPASSWORD.
	DB_PASSWORD: str(undefined),
	DB_ENCRYPT: bool(false),
	DB_TRUST_SERVER_CERT: bool(true),
	// File PEM để kiểm tra chứng chỉ của PostgreSQL: chứng chỉ CA (nội bộ) đã ký
	// cho server, HOẶC chính chứng chỉ tự ký của server (ghim chứng chỉ).
	// Đặt biến này ⇒ luôn kiểm tra chứng chỉ (bỏ qua DB_TRUST_SERVER_CERT).
	DB_CA_CERT_FILE: str(undefined),
	// Tên trong chứng chỉ (CN / SAN) khi khác DB_SERVER — vd DB_SERVER là IP hoặc
	// host.docker.internal còn chứng chỉ cấp cho tên máy.
	DB_CERT_SERVER_NAME: str(undefined),
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
	/** @type {Record<string, any>} */
	const raw = {};
	for (const [key, schema] of Object.entries(SCHEMAS)) {
		const r = schema.safeParse(source[key]);
		if (r.success) raw[key] = r.data;
		else errors.push(`${key}: ${r.error.issues.map((i) => i.message).join(', ')}`);
	}
	const isProduction = raw.NODE_ENV === 'production';
	// Hệ thống chỉ còn PostgreSQL. .env cũ còn DB_CLIENT=mssql (cổng 1433, DB RMS_HOSPITAL)
	// thì dừng hẳn, không để app nối nhầm chỗ.
	if (!isBlank(source.DB_CLIENT) && String(source.DB_CLIENT).trim() !== 'pg') {
		errors.push(
			'DB_CLIENT: chỉ còn hỗ trợ PostgreSQL — xoá dòng DB_CLIENT, đặt DB_* trỏ tới PostgreSQL',
		);
	} else if (!isBlank(source.DB_CLIENT)) {
		warnings.push('DB_CLIENT không còn dùng (luôn là PostgreSQL) — xoá dòng này khỏi .env');
	}

	// Swagger UI liệt kê toàn bộ API + cho gọi thử — tắt ở production, trừ khi
	// bật có chủ đích (SWAGGER_ENABLED=true, vd tạm thời khi tích hợp hệ thống khác).
	const swaggerEnabled = !isProduction || raw.SWAGGER_ENABLED === true;

	if (errors.length === 0) {
		if (raw.DB_CA_CERT_FILE) {
			if (!raw.DB_ENCRYPT) {
				errors.push(
					'DB_CA_CERT_FILE: cần DB_ENCRYPT=true (không mã hóa thì không có chứng chỉ để kiểm tra).',
				);
			} else {
				let pem = null;
				try {
					pem = fs.readFileSync(raw.DB_CA_CERT_FILE, 'utf8');
				} catch (err) {
					errors.push(
						`DB_CA_CERT_FILE: không đọc được ${raw.DB_CA_CERT_FILE} (${err.code || err.message}).`,
					);
				}
				if (pem !== null && !pem.includes('-----BEGIN CERTIFICATE-----')) {
					errors.push(`DB_CA_CERT_FILE: ${raw.DB_CA_CERT_FILE} không phải chứng chỉ dạng PEM.`);
				}
			}
		}

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
			//   - Không mã hóa: password hash, token đi plaintext giữa app và DB.
			//   - Tài khoản postgres: lộ là mất toàn quyền CẢ CLUSTER, không chỉ DB này.
			if (!raw.DB_ENCRYPT) {
				warnings.push(
					'DB_ENCRYPT khác "true" ở production — kết nối tới PostgreSQL không được mã hóa.',
				);
			} else if (raw.DB_TRUST_SERVER_CERT && !raw.DB_CA_CERT_FILE) {
				//   - Mã hóa nhưng không kiểm tra chứng chỉ: ai chen được vào đường mạng
				//     tới DB giả làm server được (đọc mật khẩu DB, dữ liệu).
				warnings.push(
					'DB_TRUST_SERVER_CERT=true ở production — mã hóa nhưng KHÔNG kiểm tra chứng chỉ PostgreSQL ' +
						'(giả mạo được server). Đặt DB_CA_CERT_FILE (infra/cai-dat-may-ao-ubuntu.md mục 6.7).',
				);
			}
			if (raw.DB_USER.toLowerCase() === 'postgres') {
				warnings.push(
					'DB_USER=postgres ở production — ứng dụng nên dùng role rms_app (chỉ đọc/ghi dữ liệu, infra/cai-dat-may-ao-ubuntu.md mục 6.5).',
				);
			}
		}
	}

	return {
		config:
			/** @type {Record<string, any> & { isProduction: boolean, swaggerEnabled: boolean }} */ ({
				...raw,
				isProduction,
				swaggerEnabled,
			}),
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
	for (const w of found) logger.warn(`⚠️  ${w}`);
	if (errors.length) {
		logger.error(
			`❌ Cấu hình môi trường không hợp lệ (xem backend/.env.example):\n${errors.map((e) => `   - ${e}`).join('\n')}`,
		);
		process.exit(1);
	}
	return current;
};

module.exports = { config, loadConfig, assertValidEnv, MIN_SECRET_LEN };
