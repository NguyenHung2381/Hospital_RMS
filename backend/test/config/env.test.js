// Kiểm tra cấu hình môi trường lúc khởi động (src/config/env.js): biến bắt buộc,
// quy tắc riêng của production, biến tuỳ chọn sai định dạng → cảnh báo + mặc định.
const test = require('node:test');
const assert = require('node:assert/strict');

const { loadConfig, MIN_SECRET_LEN } = require('../../src/config/env');

const BASE = {
	DB_USER: 'app',
	DB_PASSWORD: 'pw',
	JWT_SECRET: 'access-secret',
	JWT_REFRESH_SECRET: 'refresh-secret',
	SWAGGER_USER: 'docs',
	SWAGGER_PASS: 'docs-pw',
};
const PROD = {
	...BASE,
	NODE_ENV: 'production',
	JWT_SECRET: 'a'.repeat(MIN_SECRET_LEN),
	JWT_REFRESH_SECRET: 'b'.repeat(MIN_SECRET_LEN),
	CORS_ORIGIN: 'https://rms.example.com',
	DB_ENCRYPT: 'true',
};

test('đủ biến bắt buộc: không lỗi, mặc định đúng như hành vi cũ', () => {
	const { config, errors, warnings } = loadConfig(BASE);
	assert.deepEqual(errors, []);
	assert.deepEqual(warnings, []);
	assert.equal(config.PORT, 3000);
	assert.equal(config.DB_SERVER, 'localhost');
	assert.equal(config.DB_PORT, 1433);
	assert.equal(config.DB_DATABASE, 'RMS_HOSPITAL');
	assert.equal(config.DB_ENCRYPT, false);
	assert.equal(config.DB_TRUST_SERVER_CERT, true);
	assert.equal(config.DB_POOL_MAX, 10);
	assert.equal(config.API_RATE_LIMIT, 1200);
	assert.equal(config.CORS_ORIGIN, null);
	assert.equal(config.isProduction, false);
	assert.equal(config.swaggerEnabled, true);
});

test('thiếu (hoặc chỉ có khoảng trắng) biến bắt buộc ⇒ lỗi, các biến khác vẫn có mặc định', () => {
	const { config, errors } = loadConfig({ ...BASE, DB_USER: '', JWT_SECRET: '   ' });
	assert.deepEqual(errors.map((e) => e.split(':')[0]).sort(), ['DB_USER', 'JWT_SECRET']);
	assert.equal(config.DB_PORT, 1433);
});

test('Swagger bật (mặc định ngoài production) thì bắt buộc SWAGGER_USER/PASS', () => {
	const { errors } = loadConfig({ ...BASE, SWAGGER_USER: '' });
	assert.equal(errors.length, 1);
	assert.match(errors[0], /^SWAGGER_USER/);
	// Production tắt Swagger ⇒ không cần
	assert.deepEqual(loadConfig({ ...PROD, SWAGGER_USER: '', SWAGGER_PASS: '' }).errors, []);
});

test('production: secret ngắn, trùng nhau, thiếu CORS_ORIGIN ⇒ lỗi', () => {
	assert.deepEqual(loadConfig(PROD).errors, []);
	const short = loadConfig({ ...PROD, JWT_SECRET: 'short' }).errors;
	assert.match(short[0], /ít nhất 64 ký tự/);
	const same = loadConfig({ ...PROD, JWT_REFRESH_SECRET: PROD.JWT_SECRET }).errors;
	assert.match(same[0], /không được trùng/);
	const noCors = loadConfig({ ...PROD, CORS_ORIGIN: '' }).errors;
	assert.match(noCors[0], /CORS_ORIGIN/);
});

test('production: DB không mã hoá / dùng sa ⇒ chỉ cảnh báo, không chặn', () => {
	const { errors, warnings } = loadConfig({ ...PROD, DB_ENCRYPT: 'false', DB_USER: 'SA' });
	assert.deepEqual(errors, []);
	assert.equal(warnings.length, 2);
});

test('biến tuỳ chọn sai định dạng ⇒ cảnh báo nêu tên biến, dùng mặc định', () => {
	const { config, errors, warnings } = loadConfig({
		...BASE,
		DB_POOL_MAX: 'abc',
		API_RATE_LIMIT: '0',
		DB_ENCRYPT: 'yes',
	});
	assert.deepEqual(errors, []);
	assert.equal(config.DB_POOL_MAX, 10);
	assert.equal(config.API_RATE_LIMIT, 1200);
	assert.equal(config.DB_ENCRYPT, false);
	assert.deepEqual(warnings.map((w) => w.split('=')[0]).sort(), [
		'API_RATE_LIMIT',
		'DB_ENCRYPT',
		'DB_POOL_MAX',
	]);
});

test('CORS_ORIGIN tách theo dấu phẩy; TRUST_PROXY số ⇒ number, còn lại giữ string', () => {
	const { config } = loadConfig({
		...BASE,
		CORS_ORIGIN: 'https://a.vn, https://b.vn,',
		TRUST_PROXY: '2',
	});
	assert.deepEqual(config.CORS_ORIGIN, ['https://a.vn', 'https://b.vn']);
	assert.equal(config.TRUST_PROXY, 2);
	assert.equal(loadConfig({ ...BASE, TRUST_PROXY: 'loopback' }).config.TRUST_PROXY, 'loopback');
	assert.equal(loadConfig(BASE).config.TRUST_PROXY, undefined);
});
