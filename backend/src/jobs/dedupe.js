const { getPool, sql } = require('../config/db');
const { isUniqueViolation } = require('../utils/dbErrors');

/**
 * Đánh dấu (jobName, key) đã chạy — trả về true nếu đây là LẦN ĐẦU (nên xử
 * lý tiếp), false nếu đã từng chạy trước đó (bỏ qua để không gửi trùng).
 * Dựa vào UNIQUE constraint trên job_execution_log nên an toàn kể cả khi 2
 * lượt chạy job trùng thời điểm (server restart, nhiều instance...).
 */
const markOnce = async (jobName, key) => {
	const pool = await getPool();
	try {
		await pool
			.request()
			.input('job_name', sql.VarChar(50), jobName)
			.input('dedupe_key', sql.VarChar(150), key)
			.query(
				`INSERT INTO job_execution_log (job_name, dedupe_key) VALUES (@job_name, @dedupe_key)`,
			);
		return true;
	} catch (err) {
		if (isUniqueViolation(err)) return false; // vi phạm UNIQUE = đã chạy rồi
		throw err;
	}
};

module.exports = { markOnce };
