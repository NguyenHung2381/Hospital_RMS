const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool, sql } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const login = async (username, password) => {
	const pool = await getPool();

	const result = await pool
		.request()
		.input('username', sql.VarChar(50), username).query(`
      SELECT u.id, u.username, u.password, u.full_name, u.email, u.staff_number,
             u.role_id, u.account_type, u.is_active, u.department_id,
             u.account_expires_at, r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.username = @username
    `);

	const user = result.recordset[0];
	if (!user)
		throw {
			statusCode: 401,
			message: 'Tên đăng nhập hoặc mật khẩu không đúng',
		};
	// is_active = 0 bao gồm cả TK bị vô hiệu hóa thủ công lẫn TK hết hạn
	// (sp_deactivate_expired_accounts set is_active=0 mỗi đêm)
	if (!user.is_active)
		throw {
			statusCode: 403,
			message: 'Tài khoản đã bị vô hiệu hóa hoặc hết hạn sử dụng',
		};

	const isMatch = await bcrypt.compare(password, user.password);
	if (!isMatch)
		throw {
			statusCode: 401,
			message: 'Tên đăng nhập hoặc mật khẩu không đúng',
		};

	const payload = {
		id: user.id,
		username: user.username,
		full_name: user.full_name,
		staff_number: user.staff_number ? String(user.staff_number) : null,
		role_id: user.role_id,
		account_type: user.account_type,
		department_id: user.department_id,
		account_expires_at: user.account_expires_at
			? new Date(user.account_expires_at).toISOString().split('T')[0]
			: null,
	};

	const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
		expiresIn: process.env.JWT_EXPIRES_IN || '8h',
	});

	const refreshToken = jwt.sign(
		{ id: user.id },
		process.env.JWT_REFRESH_SECRET,
		{
			expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
		},
	);

	// Store refresh token via SP (handles id generation + remember_me)
	await pool
		.request()
		.input('user_id', sql.VarChar(20), user.id)
		.input('token', sql.VarChar(512), refreshToken)
		.input('remember_me', sql.Bit, 0)
		.execute('sp_create_refresh_token');

	return {
		user: {
			id: user.id,
			username: user.username,
			staff_number: user.staff_number ? String(user.staff_number) : null,
			full_name: user.full_name,
			email: user.email,
			role: user.role_name,
			account_type: user.account_type,
			department_id: user.department_id,
		},
		access_token: accessToken,
		refresh_token: refreshToken,
	};
};

const refreshAccessToken = async (refreshToken) => {
	let decoded;
	try {
		decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
	} catch {
		throw {
			statusCode: 401,
			message: 'Refresh token không hợp lệ hoặc đã hết hạn',
		};
	}

	const pool = await getPool();
	const rt = await pool
		.request()
		.input('token', sql.VarChar(500), refreshToken)
		.query(
			`SELECT * FROM refresh_tokens WHERE token = @token AND expires_at > GETDATE()`,
		);

	if (!rt.recordset[0])
		throw { statusCode: 401, message: 'Refresh token không hợp lệ' };

	const userResult = await pool
		.request()
		.input('id', sql.VarChar(20), decoded.id)
		.query(
			`SELECT u.*, r.name AS role_name FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.id=@id`,
		);

	const user = userResult.recordset[0];
	if (!user) throw { statusCode: 401, message: 'Người dùng không tồn tại' };
	const payload = {
		id: user.id,
		username: user.username,
		full_name: user.full_name,
		staff_number: user.staff_number ? String(user.staff_number) : null,
		role_id: user.role_id,
		account_type: user.account_type,
		department_id: user.department_id,
	};
	const newAccessToken = jwt.sign(payload, process.env.JWT_SECRET, {
		expiresIn: process.env.JWT_EXPIRES_IN || '8h',
	});

	return { access_token: newAccessToken };
};

const logout = async (refreshToken) => {
	const pool = await getPool();
	await pool
		.request()
		.input('token', sql.VarChar(500), refreshToken)
		.query(`DELETE FROM refresh_tokens WHERE token = @token`);
};

const changePassword = async (userId, oldPassword, newPassword) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.query(`SELECT password FROM users WHERE id = @id`);

	const user = result.recordset[0];
	if (!user) throw { statusCode: 404, message: 'Người dùng không tồn tại' };

	const isMatch = await bcrypt.compare(oldPassword, user.password);
	if (!isMatch) throw { statusCode: 400, message: 'Mật khẩu cũ không đúng' };

	const hashed = await bcrypt.hash(newPassword, 10);
	await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.input('password', sql.VarChar(255), hashed)
		.query(
			`UPDATE users SET password = @password, password_changed_at = GETDATE(), updated_at = GETDATE(), updated_by = @id WHERE id = @id`,
		);
};

module.exports = { login, refreshAccessToken, logout, changePassword };
