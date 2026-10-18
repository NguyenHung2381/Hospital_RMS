const { getPool } = require('../../config/db');

// Danh mục chức danh — chỉ đọc qua API (không có route tạo/sửa).
const getAll = async () => {
	const pool = await getPool();
	return (await pool.request().query('SELECT id, name FROM job_titles ORDER BY name')).recordset;
};

module.exports = { getAll };
