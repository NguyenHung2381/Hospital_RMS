const { config } = require('./env');

// Chọn lớp truy cập DB theo DB_CLIENT (mặc định mssql). Hai bản có cùng giao
// diện: getPool(), sql (kiểu tham số, Request, Transaction), withTransaction(),
// withActor(). Trong thời gian chuyển DB (POSTGRESQL_MIGRATION_PLAN.md mục 5.1)
// cùng một nhánh code chạy được trên cả SQL Server và PostgreSQL; sau cutover
// xoá db.mssql.js.
// Kiểu (tsc) theo bản mssql: db.pg.js dựng lại đúng giao diện đó cho code gọi.
/** @type {typeof import('./db.mssql') & { client: 'mssql' | 'pg' }} */
module.exports =
	config.DB_CLIENT === 'pg' ? /** @type {any} */ (require('./db.pg')) : require('./db.mssql');
