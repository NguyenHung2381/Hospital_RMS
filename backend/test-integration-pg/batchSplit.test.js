// Lô nhiều câu đã tách (queryAll, updateReturning, DECLARE → JS) trên PostgreSQL THẬT.
// Cùng các ca với bản SQL Server (test-integration/batchSplit.cases.js); chạy
// trong transaction rồi ROLLBACK.
//
//   npm run test:pg
//
// Kết nối: như adapter.test.js (PG_TEST_HOST / PORT / DATABASE / USER / PASSWORD).
const test = require('node:test');

Object.assign(process.env, {
	DB_CLIENT: 'pg',
	DB_SERVER: process.env.PG_TEST_HOST || '127.0.0.1',
	DB_PORT: process.env.PG_TEST_PORT || '5432',
	DB_DATABASE: process.env.PG_TEST_DATABASE || 'rms_hospital',
	DB_USER: process.env.PG_TEST_USER || 'rms_app',
	DB_PASSWORD: process.env.PG_TEST_PASSWORD || '',
	DB_ENCRYPT: 'false',
});

const db = require('../src/config/db');
const { run } = require('../test-integration/batchSplit.cases');

test('lô đã tách trên PostgreSQL thật (rollback)', async (t) => {
	// Các ca dưới còn cú pháp T-SQL khác ngoài phạm vi mục này — bật lại khi các mục đó xong:
	// phân trang (CROSS APPLY), dashboard (CONVERT / YEAR), đồng bộ bài học + xoá buổi học
	// (lessonProgressService: UPDATE … FROM rồi SELECT @@ROWCOUNT trong 1 lô), xoá thông
	// báo theo lô (DATEADD).
	await run(t, db, {
		skip: [
			'danh sách phân trang tách câu: dữ liệu + tổng + thống kê',
			'dashboard: các lô thống kê đã tách chạy được',
			'đồng bộ bài học của chương trình vào hồ sơ: chép đủ, chạy lại thì 0',
			'xoá buổi học: đọc khóa / bài rồi xoá dòng',
			'xoá thông báo cũ theo lô (DELETE … WHERE id IN (… FETCH NEXT))',
		],
	});
	// Sau rollback của run() (hook chạy theo thứ tự đăng ký)
	t.after(async () => (await db.getPool()).close());
});
