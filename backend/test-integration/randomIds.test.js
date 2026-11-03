// Test tích hợp: mã ngẫu nhiên sinh bằng JS / newIdSql (thay DECLARE @new_id ... NEWID())
// trên SQL Server THẬT.
// Chạy trong 1 transaction rồi ROLLBACK ⇒ không để lại dữ liệu.
//
//   npm run test:smoke   (chạy cùng smoke.test.js)
//
// Bản PostgreSQL: test-integration-pg/randomIds.test.js (cùng các ca).
const test = require('node:test');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const db = require('../src/config/db');
const { run } = require('./randomIds.cases');

test('mã ngẫu nhiên trên SQL Server thật (rollback)', async (t) => {
	await run(t, db);
	// Sau rollback của run() (hook chạy theo thứ tự đăng ký)
	t.after(async () => (await db.getPool()).close());
});
