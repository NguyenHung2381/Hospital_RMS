// Test tích hợp: cú pháp SQL viết chung cho 2 DB (boolExpr, bỏ N, COALESCE,
// CONCAT) trên SQL Server THẬT, chỉ đọc.
//
//   npm run test:smoke   (chạy cùng smoke.test.js)
//
// Bản PostgreSQL: test-integration-pg/portableSql.test.js (cùng các ca).
const test = require('node:test');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const db = require('../src/config/db');
const { run } = require('./portableSql.cases');

test('cú pháp chung 2 DB trên SQL Server thật', async (t) => {
	await run(t, db);
	// Sau rollback của run() (hook chạy theo thứ tự đăng ký)
	t.after(async () => (await db.getPool()).close());
});
