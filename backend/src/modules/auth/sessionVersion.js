const { getPool, sql } = require('../../config/db');
const userStatusCache = require('../../middlewares/userStatusCache');

// users.token_version — "phiên bản phiên đăng nhập" của tài khoản. Access token
// mang claim `tv`; middlewares/auth.js từ chối token có tv khác giá trị hiện
// tại. Tăng version = thu hồi NGAY mọi access token đang lưu hành của tài khoản
// (JWT stateless không thu hồi được theo cách khác — trước đây phải chờ hết hạn
// 8h).

const currentTokenVersion = async (userId, pool = null) => {
	const p = pool ?? (await getPool());
	const r = await p
		.request()
		.input('id', sql.VarChar(20), userId)
		.query('SELECT token_version FROM users WHERE id = @id');
	return r.recordset[0]?.token_version ?? 0;
};

// Trả về version mới.
const bumpTokenVersion = async (userId, pool = null) => {
	const p = pool ?? (await getPool());
	const r = await p
		.request()
		.input('id', sql.VarChar(20), userId)
		.query(`
      UPDATE users SET token_version = token_version + 1 WHERE id = @id;
      SELECT token_version FROM users WHERE id = @id;
    `);
	userStatusCache.clear(userId); // hiệu lực ngay ở mọi instance
	return r.recordset[0]?.token_version ?? 0;
};

module.exports = { currentTokenVersion, bumpTokenVersion };
