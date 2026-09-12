const { getPool, sql } = require('../config/db');
const notificationService = require('../services/notificationService');
const { markOnce } = require('./dedupe');

// Job nền bảo trì tài khoản:
//  1. Gọi sp_deactivate_expired_accounts — stored proc đã tồn tại từ trước
//     nhưng CHƯA có gì gọi tới (gap đã xác nhận khi khảo sát code).
//  2. Cảnh báo người dùng có mật khẩu quá hạn lâu ngày chưa đổi.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const todayKeyVN = () => {
	const vn = new Date(Date.now() + VN_OFFSET_MS);
	return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, '0')}-${String(vn.getUTCDate()).padStart(2, '0')}`;
};

const PASSWORD_MAX_AGE_DAYS = 90;
const PASSWORD_WARNING_INTERVAL_DAYS = 30; // nhắc lại mỗi 30 ngày, không phải mỗi ngày

const deactivateExpiredAccounts = async (pool) => {
	const firstTimeToday = await markOnce('deactivate_expired_accounts', todayKeyVN());
	if (!firstTimeToday) return; // đã chạy hôm nay (vd server restart nhiều lần)

	const result = await pool.request().execute('sp_deactivate_expired_accounts');
	const deactivated = result.recordset?.[0]?.deactivated_count ?? 0;
	if (deactivated > 0)
		console.log(`[job:account_maintenance] Đã vô hiệu hoá ${deactivated} tài khoản hết hạn.`);
};

const warnStalePasswords = async (pool) => {
	const stale = (
		await pool.request().input('days', sql.Int, PASSWORD_MAX_AGE_DAYS).query(`
			SELECT id, email, full_name
			FROM users
			WHERE is_active = 1
			  AND password_changed_at IS NOT NULL
			  AND DATEDIFF(DAY, password_changed_at, GETDATE()) >= @days
		`)
	).recordset;

	for (const user of stale) {
		// Nhắc lại mỗi PASSWORD_WARNING_INTERVAL_DAYS ngày (dedupe theo "chu kỳ"
		// thay vì theo ngày cụ thể) để không spam mỗi đêm.
		const cycle = Math.floor(Date.now() / (PASSWORD_WARNING_INTERVAL_DAYS * 86400000));
		const firstTime = await markOnce('password_expiry_warning', `${user.id}:${cycle}`);
		if (!firstTime) continue;

		await notificationService.pushWithEmail(
			'password_expiry_warning',
			'Mật khẩu của bạn đã lâu chưa đổi',
			[user.id],
			{
				message: `Mật khẩu tài khoản của bạn chưa đổi hơn ${PASSWORD_MAX_AGE_DAYS} ngày. Vui lòng đổi mật khẩu mới để đảm bảo an toàn tài khoản.`,
			},
		);
	}
};

const run = async () => {
	const pool = await getPool();
	await deactivateExpiredAccounts(pool);
	await warnStalePasswords(pool);
};

module.exports = { run };
