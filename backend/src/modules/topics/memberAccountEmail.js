const { getPool, sql } = require('../../config/db');
const { ROLE, inputRoleId } = require('../access/roleCodes');

// Email thật của nhân viên có tài khoản, tra theo mã NV — ô "tìm người" chỉ trả
// email đã che (userService.searchForMember) nên thành viên chọn từ gợi ý được
// gửi lên với email trống, server tự điền ở đây. Chỉ khi khớp ĐÚNG 1 tài khoản
// nhân viên đang hoạt động có email thật; không thì trả null (để trống như cũ).
const emailFromStaffAccount = async (staffNumber) => {
	const sn = Number(String(staffNumber ?? '').trim());
	if (!Number.isInteger(sn) || sn <= 0) return null;
	const pool = await getPool();
	const req = await inputRoleId(
		pool.request().input('sn', sql.Int, sn),
		'trainee_role',
		ROLE.TRAINEE,
	);
	const rows = (
		await req.query(`
			SELECT TOP 2 email FROM users
			WHERE staff_number = @sn AND is_active = 'true'
			  AND (role_id IS NULL OR role_id <> @trainee_role)
			  AND email IS NOT NULL AND email NOT LIKE '%.local'
		`)
	).recordset;
	return rows.length === 1 ? rows[0].email : null;
};

// Middleware cho POST/PUT /topics/:id/members — chạy TRƯỚC formConfigGuard để
// Cấu hình form bắt buộc email vẫn qua được khi email do server điền.
const fillEmailFromStaffAccount = async (req, _res, next) => {
	try {
		const body = req.body || {};
		if (!String(body.email ?? '').trim() && body.staff_number) {
			const email = await emailFromStaffAccount(body.staff_number);
			if (email) body.email = email;
		}
		next();
	} catch (err) {
		next(err);
	}
};

module.exports = { emailFromStaffAccount, fillEmailFromStaffAccount };
