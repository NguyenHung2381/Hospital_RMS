const { getPool, sql } = require('../config/db');

// ponytail: buffer trong RAM, mất tối đa ~FLUSH_INTERVAL_MS log nếu server
// crash giữa chừng — chấp nhận được cho audit log (không phải dữ liệu tài
// chính), đổi lại giảm round-trip DB rất nhiều so với insert từng request.
const FLUSH_INTERVAL_MS = 2000;
const MAX_BUFFER = 200;

let buffer = [];

const flush = async () => {
	if (!buffer.length) return;
	const batch = buffer.splice(0, buffer.length);

	try {
		const pool = await getPool();
		const request = pool.request();
		const values = batch.map((row, i) => {
			request.input(`actor_id${i}`, sql.VarChar(20), row.actor_id);
			request.input(`actor_username${i}`, sql.VarChar(100), row.actor_username);
			request.input(`method${i}`, sql.VarChar(10), row.method);
			request.input(`path${i}`, sql.VarChar(255), row.path);
			request.input(`status_code${i}`, sql.Int, row.status_code);
			request.input(`ip${i}`, sql.VarChar(45), row.ip);
			request.input(`body${i}`, sql.NVarChar(1000), row.body);
			return `(@actor_id${i}, @actor_username${i}, @method${i}, @path${i}, @status_code${i}, @ip${i}, @body${i})`;
		});

		await request.query(`
      INSERT INTO activity_logs (actor_id, actor_username, method, path, status_code, ip_address, request_body)
      VALUES ${values.join(',')};
    `);
	} catch (err) {
		// Log không bao giờ được làm hỏng request chính — chỉ cảnh báo ra console.
		console.error('[ActivityLog] Ghi log thất bại:', err.message);
	}
};

setInterval(flush, FLUSH_INTERVAL_MS).unref();

const enqueue = (entry) => {
	buffer.push(entry);
	if (buffer.length >= MAX_BUFFER) flush();
};

// Keyset (seek) pagination — không dùng OFFSET vì bảng có thể lên tới hàng
// triệu dòng, OFFSET càng về sau càng chậm do phải quét bỏ qua từng đó dòng.
const getAll = async ({ limit = 50, cursor, actor_id, method, search } = {}) => {
	const pool = await getPool();
	const request = pool.request().input('limit', sql.Int, limit);
	const conditions = [];

	if (cursor) {
		conditions.push('created_at < @cursor');
		request.input('cursor', sql.DateTime2, new Date(cursor));
	}
	if (actor_id) {
		conditions.push('actor_id = @actor_id');
		request.input('actor_id', sql.VarChar(20), actor_id);
	}
	if (method) {
		conditions.push('method = @method');
		request.input('method', sql.VarChar(10), method);
	}
	if (search) {
		conditions.push('path LIKE @search');
		request.input('search', sql.VarChar(255), `%${search}%`);
	}
	const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

	const result = await request.query(`
    SELECT TOP (@limit) id, actor_id, actor_username, method, path, status_code, ip_address, created_at
    FROM   activity_logs
    ${where}
    ORDER  BY created_at DESC, id DESC;
  `);

	const rows = result.recordset;
	const nextCursor = rows.length === limit ? rows[rows.length - 1].created_at : null;
	return { data: rows, next_cursor: nextCursor };
};

module.exports = { enqueue, flush, getAll };
