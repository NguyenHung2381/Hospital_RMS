// CSDL giả cho test tầng auth — thay config/db.getPool (và sql.Transaction /
// sql.Request cho code chạy trong transaction) TRƯỚC khi require các service
// (chúng destructure getPool lúc nạp module). `handler(sqlText, inputs)` trả về
// recordset (mảng) cho từng câu truy vấn / stored procedure ("EXEC <tên>");
// mọi câu đều được ghi vào `log`. Mỗi file test chạy ở tiến trình riêng nên
// việc vá module db không ảnh hưởng file khác.
const db = require('../../src/config/db');

const install = (handler) => {
	const log = [];
	const makeRequest = () => {
		const inputs = {};
		const run = async (text) => {
			log.push({ text, inputs: { ...inputs } });
			const recordset = (await handler(text, inputs)) ?? [];
			return { recordset, recordsets: [recordset], rowsAffected: [recordset.length] };
		};
		const req = {
			input(name, _type, value) {
				inputs[name] = arguments.length === 2 ? _type : value;
				return req;
			},
			// mssql: req.output(name, type) khai báo tham số OUTPUT; sau execute,
			// giá trị nằm ở result.output[name] (KHÔNG phải req.output[name]) —
			// lấy từ dòng đầu recordset giả.
			output: () => req,
			query: run,
			async execute(proc) {
				const r = await run(`EXEC ${proc}`);
				return { ...r, output: { ...(r.recordset[0] ?? {}) } };
			},
		};
		return req;
	};
	db.getPool = async () => ({ request: makeRequest });
	db.sql.Request = function FakeRequest() {
		return makeRequest();
	};
	db.sql.Transaction = class FakeTransaction {
		async begin() {}
		async commit() {
			log.push({ text: 'COMMIT', inputs: {} });
		}
		async rollback() {
			log.push({ text: 'ROLLBACK', inputs: {} });
		}
		request() {
			return makeRequest();
		}
	};
	// Lô nhiều câu: adapter thật chạy từng câu bằng tham số nội bộ của Request thật.
	// Ở đây ghép thành 1 chuỗi cho handler khớp cả lô (như khi xem log). queryBatch
	// phải thay ở module adapter: db.queryBatch / actorRequest gọi qua đó lúc chạy.
	const pgAdapter = require('../../src/config/db.pg');
	pgAdapter.queryBatch = (req, statements) => req.query(statements.join(';\n'));
	db.queryAll = async (req, statements) => {
		const r = await req.query(statements.join(';\n'));
		return statements.map((_, i) => r.recordsets[i] ?? []);
	};
	// withActor thật chỉ nhận Transaction thật của adapter → thay bằng câu ghi người
	// thao tác chạy trên transaction giả (vẫn ghi vào log)
	db.withActor = (tx, actorId) =>
		tx
			.request()
			.input('actor_id', db.sql.VarChar(20), actorId ?? null)
			.query("SELECT set_config('app.current_user_id', coalesce(@actor_id, ''), true)");
	// Khoá sinh mã (utils/idGenerator) — luôn lấy được, ghi vào log
	db.lockResource = async (_tx, key) => {
		log.push({ text: `LOCK ${key}`, inputs: {} });
		return true;
	};
	// withTransaction gọi getPool nội bộ của config/db (không qua db.getPool đã
	// thay ở trên) ⇒ phải thay riêng, cùng ngữ nghĩa commit / rollback rồi ném lại.
	db.withTransaction = async (fn) => {
		const tx = new db.sql.Transaction();
		await tx.begin();
		try {
			const result = await fn(tx);
			await tx.commit();
			return result;
		} catch (err) {
			await tx.rollback();
			throw err;
		}
	};
	return log;
};

module.exports = { install };
