// Test tích hợp: lô nhiều câu đã tách (queryAll, updateReturning, DECLARE → JS)
// trên SQL Server THẬT.
// Chạy trong 1 transaction rồi ROLLBACK ⇒ không để lại dữ liệu.
//
//   npm run test:smoke   (chạy cùng smoke.test.js)
//
// Bản PostgreSQL: test-integration-pg/batchSplit.test.js (cùng các ca).
const test = require('node:test');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const db = require('../src/config/db');
const { run } = require('./batchSplit.cases');

test('lô đã tách trên SQL Server thật (rollback)', async (t) => {
	await run(t, db);
	// Sau rollback của run() (hook chạy theo thứ tự đăng ký)
	t.after(async () => (await db.getPool()).close());
});
