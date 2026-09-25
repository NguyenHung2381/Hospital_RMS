// CSDL giả cho test tầng auth — thay config/db.getPool (và sql.Transaction /
// sql.Request cho code chạy trong transaction) TRƯỚC khi require các service
// (chúng destructure getPool lúc nạp module). `handler(sqlText, inputs)` trả về
// recordset (mảng) cho từng câu truy vấn / stored procedure ("EXEC <tên>");
// mọi câu đều được ghi vào `log`. Mỗi file test chạy ở tiến trình riêng nên
// việc vá module mssql không ảnh hưởng file khác.
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
			// giá trị nằm ở req.output[name] — lấy từ dòng đầu recordset giả.
			output: () => req,
			query: run,
			async execute(proc) {
				const r = await run(`EXEC ${proc}`);
				Object.assign(req.output, r.recordset[0] ?? {});
				return r;
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
	return log;
};

module.exports = { install };
