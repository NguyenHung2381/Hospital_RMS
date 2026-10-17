const { getPool } = require('../config/db');
const migrator = require('./migrator');

// Chạy lúc server khởi động, TRƯỚC khi nhận request (server.js / cluster.js):
//   1. Migration (database/migrations/*.sql):
//        DB_AUTO_MIGRATE=true  (mặc định ngoài production) — tự chạy file mới.
//        DB_AUTO_MIGRATE=false (mặc định production) — chỉ cảnh báo file chưa
//          chạy; pipeline deploy chạy `node scripts/migrate.js` bằng login có
//          quyền ALTER trước khi đổi container (scripts/deploy.ps1).
//   2. permissions.initPermissions(): kiểm tra CSDL đủ cho mô hình phân quyền
//      (thiếu thì DỪNG server) + đồng bộ catalog quyền.
// Không kết nối được CSDL (SQL Server chưa lên...) thì chỉ cảnh báo, server
// vẫn chạy — mọi API cần DB tự lỗi cho tới khi DB sẵn sàng.

const isConnectionError = (err) =>
	['ESOCKET', 'ETIMEOUT', 'ELOGIN', 'ECONNCLOSED', 'ENOTOPEN'].includes(err?.code) ||
	err?.name === 'ConnectionError';

const autoMigrate = () =>
	process.env.DB_AUTO_MIGRATE ? process.env.DB_AUTO_MIGRATE === 'true' : process.env.NODE_ENV !== 'production';

const runMigrations = async () => {
	if (autoMigrate()) {
		const { ran, changed } = await migrator.migrate({ log: (m) => console.log(`[migrate] ${m}`) });
		if (ran.length) console.log(`✅ [migrate] Đã chạy ${ran.length} migration`);
		if (changed.length) console.warn(`⚠️  [migrate] File đã sửa sau khi chạy (không chạy lại): ${changed.join(', ')}`);
		return;
	}
	const { tracked, pending } = await migrator.status();
	if (!tracked) console.warn('⚠️  [migrate] Chưa có bảng schema_migrations — không kiểm tra được migration');
	else if (pending.length) console.warn(`⚠️  [migrate] ${pending.length} migration chưa chạy: ${pending.join(', ')}`);
};

const initDatabase = async () => {
	try {
		await getPool();
	} catch (err) {
		console.warn(`⚠️  [db] Chưa kết nối được CSDL (${err.message}) — bỏ qua migration/kiểm tra phân quyền`);
		return;
	}

	try {
		await runMigrations();
	} catch (err) {
		if (isConnectionError(err)) {
			console.warn(`⚠️  [migrate] Mất kết nối CSDL (${err.message}) — bỏ qua`);
			return;
		}
		// Thường gặp: login không có quyền ALTER — bước kiểm tra dưới báo rõ thiếu gì
		console.error(`❌ [migrate] ${err.message}`);
	}

	await require('../permissions').initPermissions();
};

module.exports = { initDatabase, isConnectionError };
