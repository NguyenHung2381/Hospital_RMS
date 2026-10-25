// Đối chiếu code với schema THẬT: mọi câu "INSERT INTO <bảng> (<cột>...)" viết
// sẵn trong src/ chỉ được ghi cột đang có trên DB. Bắt lỗi kiểu "Invalid column
// name 'created_by'" — chỉ lộ ra khi chạy đúng thao tác đó (test đơn vị dùng CSDL
// giả nên không thấy). Chỉ đọc sys.tables / sys.columns. Không chạy trên CI.
//
//   docker exec hospital_rms_dev-backend-1 npm run test:smoke
//
// Bỏ qua: bảng không có trên DB (bảng tạm / biến bảng), danh sách cột dựng động (${...}).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { getPool, sql } = require('../src/config/db');

const SRC = path.join(__dirname, '..', 'src');
const walk = (d) =>
	fs
		.readdirSync(d, { withFileTypes: true })
		.flatMap((e) =>
			e.isDirectory()
				? walk(path.join(d, e.name))
				: e.name.endsWith('.js')
					? [path.join(d, e.name)]
					: [],
		);

test('INSERT trong src/ chỉ ghi cột có trên DB', async (t) => {
	const pool = await getPool();
	t.after(() => pool.close());
	const rows = (
		await pool
			.request()
			.input('schema', sql.NVarChar(20), 'dbo')
			.query(
				`SELECT t.name AS t, c.name AS c FROM sys.tables t
				 JOIN sys.columns c ON c.object_id = t.object_id WHERE t.schema_id = SCHEMA_ID(@schema)`,
			)
	).recordset;
	const columns = new Map();
	for (const r of rows) {
		const key = r.t.toLowerCase();
		if (!columns.has(key)) columns.set(key, new Set());
		columns.get(key).add(r.c.toLowerCase());
	}

	const problems = [];
	let checked = 0;
	for (const file of walk(SRC)) {
		const text = fs.readFileSync(file, 'utf8');
		for (const m of text.matchAll(/INSERT\s+INTO\s+(?:\[?dbo\]?\.)?\[?(\w+)\]?\s*\(([^)]*)\)/gi)) {
			const table = m[1].toLowerCase();
			if (!columns.has(table) || m[2].includes('$')) continue;
			checked++;
			const missing = m[2]
				.split(',')
				.map((c) => c.trim().replace(/[[\]]/g, '').toLowerCase())
				.filter((c) => c && !columns.get(table).has(c));
			if (missing.length) {
				const line = text.slice(0, m.index).split('\n').length;
				problems.push(
					`${path.relative(SRC, file)}:${line} ${table} thiếu cột ${missing.join(', ')}`,
				);
			}
		}
	}
	t.diagnostic(`${checked} câu INSERT đã đối chiếu`);
	assert.ok(checked > 0, 'không tìm thấy câu INSERT nào — regex hỏng?');
	assert.deepEqual(problems, []);
});
