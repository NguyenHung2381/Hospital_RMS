const { getPool } = require('../config/db');

// Cột đã có trong DB chưa — cho code chạy được cả trước lẫn sau migration
// (permissions/migrations.js tự nâng cấp lúc khởi động; login ứng dụng không có
// quyền ALTER thì DBA chạy file SQL trong backend/migrations/). Kết quả cache
// suốt đời process; migration gọi reset() sau khi thêm cột.
const _known = new Map(); // "table.column" → boolean

const hasColumn = async (table, column) => {
	const key = `${table}.${column}`;
	if (_known.has(key)) return _known.get(key);
	const pool = await getPool();
	const r = await pool
		.request()
		.input('t', table)
		.input('c', column)
		.query('SELECT COL_LENGTH(@t, @c) AS len');
	const exists = r.recordset[0].len != null;
	_known.set(key, exists);
	return exists;
};

const reset = () => _known.clear();

module.exports = { hasColumn, reset };
