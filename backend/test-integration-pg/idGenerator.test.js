// Sinh mã bằng JS (src/utils/idGenerator.js, thay sp_gen_*) trên PostgreSQL THẬT.
// Các ca ở idGenerator.cases.js; chạy
// trong transaction rồi ROLLBACK.
//
//   npm run test:pg
//
// Kết nối: như adapter.test.js (PG_TEST_HOST / PORT / DATABASE / USER / PASSWORD).
const test = require('node:test');

Object.assign(process.env, {
	DB_SERVER: process.env.PG_TEST_HOST || '127.0.0.1',
	DB_PORT: process.env.PG_TEST_PORT || '5432',
	DB_DATABASE: process.env.PG_TEST_DATABASE || 'rms_hospital',
	DB_USER: process.env.PG_TEST_USER || 'rms_app',
	DB_PASSWORD: process.env.PG_TEST_PASSWORD || '',
	DB_ENCRYPT: 'false',
});

const db = require('../src/config/db');
require('../src/modules/events/eventService').broadcast = () => {};
const { run } = require('./idGenerator.cases');

test('sinh mã trên PostgreSQL thật (rollback)', async (t) => {
	await run(t, db);
	// Sau rollback của run() (hook chạy theo thứ tự đăng ký): pool chỉ đóng khi đã trả kết nối
	t.after(async () => (await db.getPool()).close());
});
