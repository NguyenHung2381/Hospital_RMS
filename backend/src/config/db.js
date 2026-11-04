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
 * Nhiều câu thì truyền mảng: chạy lần lượt trong cùng 1 transaction, trả kết quả câu
 * đầu (PG không cho ghép nhiều câu có tham số vào 1 lệnh bằng ';'). Cần kết quả của câu
 * sau (UPDATE rồi SELECT) thì dùng queryBatch(req, [...]).
 * @param {string | null | undefined} actorId
 */
const actorRequest = (actorId) => {
	/** @type {any[][]} */
	const inputs = [];
	/** @param {any} tx */
	const build = (tx) => {
		const r = tx.request();
		for (const a of inputs) r.input(.../** @type {[string, any, any]} */ (a));
		return r;
	};
	const req = {
		isActorRequest: true,
		/** @param {...any} args như mssql Request.input(name, [type], value) */
		input(...args) {
			inputs.push(args);
			return req;
		},
		/** @param {string | string[]} text */
		query: (text) =>
			withActorTransaction(actorId, async (tx) => {
				const results = [];
				for (const stmt of Array.isArray(text) ? text : [text])
					results.push(await build(tx).query(stmt));
				return results[0];
			}),
		// queryBatch(actorRequest(...), [...]) gọi tới đây: cả lô trong 1 transaction có người thao tác
		/** @param {string[]} statements */
		queryBatch: (statements) =>
			withActorTransaction(actorId, (tx) => adapter.queryBatch(build(tx), statements)),
	};
	return req;
};

/**
 * Như queryBatch của adapter (nhiều câu lần lượt, chung tham số, gộp kết quả), nhận
 * thêm request dựng bằng actorRequest.
 * @param {any} req
 * @param {string[]} statements
 */
const queryBatch = (req, statements) =>
	req.isActorRequest ? req.queryBatch(statements) : adapter.queryBatch(req, statements);

module.exports = { ...adapter, withActorTransaction, actorRequest, queryBatch };
