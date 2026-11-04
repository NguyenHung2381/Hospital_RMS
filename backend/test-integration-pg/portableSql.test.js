// Cú pháp SQL viết chung cho 2 DB trên PostgreSQL THẬT, chỉ đọc.
// Các ca ở portableSql.cases.js.
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
const { run } = require('./portableSql.cases');

test('cú pháp chung 2 DB trên PostgreSQL thật', async (t) => {
	await run(t, db);
	// Sau rollback của run() (hook chạy theo thứ tự đăng ký)
	t.after(async () => (await db.getPool()).close());
});
