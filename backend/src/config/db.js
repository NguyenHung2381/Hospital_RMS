const { config } = require('./env');

// Chọn lớp truy cập DB theo DB_CLIENT (mặc định mssql). Hai bản có cùng giao
// diện: getPool(), sql (kiểu tham số, Request, Transaction), withTransaction(),
// withActor(). Trong thời gian chuyển DB (POSTGRESQL_MIGRATION_PLAN.md mục 5.1)
// cùng một nhánh code chạy được trên cả SQL Server và PostgreSQL; sau cutover
// xoá db.mssql.js.
// Kiểu (tsc) theo bản mssql: db.pg.js dựng lại đúng giao diện đó cho code gọi.
/** @type {typeof import('./db.mssql') & { client: 'mssql' | 'pg' }} */
const adapter =
	config.DB_CLIENT === 'pg' ? /** @type {any} */ (require('./db.pg')) : require('./db.mssql');

/**
 * Chạy `fn(tx)` trong 1 transaction đã ghi người thao tác (trigger audit đọc ra
 * `updated_by`). Thay cho việc gọi thủ tục ghi người thao tác trong cùng batch trên pool:
 * PG chỉ giữ người thao tác trong transaction (set_config(..., true)).
 *   await withActorTransaction(actorId, (tx) => tx.request().input(...).query('UPDATE ...'));
 * Đã có transaction sẵn thì gọi `await withActor(tx, actorId)` trước câu ghi.
 * Gọi qua module.exports để test thay được withTransaction / withActor.
 * @template T
 * @param {string | null | undefined} actorId
 * @param {(tx: import('mssql').Transaction) => Promise<T>} fn
 * @returns {Promise<T>}
 */
const withActorTransaction = (actorId, fn) =>
	module.exports.withTransaction(async (tx) => {
		await module.exports.withActor(tx, actorId);
		return fn(tx);
	});

/**
 * Request ghi kèm người thao tác, dựng dần như `pool.request()`: gom các
 * `.input()`, tới `.query(text)` mới mở withActorTransaction và chạy 1 câu.
 * Dùng khi request được dựng qua nhiều bước (UPDATE ... SET theo trường có gửi):
 *   const req = actorRequest(actorId).input('id', sql.VarChar(20), id);
 *   if (data.name !== undefined) req.input('name', sql.NVarChar(255), data.name);
 *   await req.query(`UPDATE ... WHERE id = @id`);
 * @param {string | null | undefined} actorId
 */
const actorRequest = (actorId) => {
	/** @type {any[][]} */
	const inputs = [];
	const req = {
		/** @param {...any} args như mssql Request.input(name, [type], value) */
		input(...args) {
			inputs.push(args);
			return req;
		},
		/** @param {string} text */
		query: (text) =>
			withActorTransaction(actorId, (tx) => {
				const r = tx.request();
				for (const a of inputs) r.input(.../** @type {[string, any, any]} */ (a));
				return r.query(text);
			}),
	};
	return req;
};

module.exports = { ...adapter, withActorTransaction, actorRequest };
