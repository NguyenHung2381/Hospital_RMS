const { getPool, sql } = require('../config/db');
const notificationService = require('../services/notificationService');
const { markOnce } = require('./dedupe');
const { todayVN } = require('../utils/vnDate');

// Job nền: quét round_deadlines mỗi ngày, chủ động nhắc TRƯỚC khi tới hạn
// (thay vì chỉ chặn PHẢN ỨNG như deadlineGuard.js) — mirror
// cron_nckh_nhac_viec.php của hệ thống NCKH bệnh viện.
const UPCOMING_DAYS_BEFORE = 3;

const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const dateOnly = (d) => {
	const dt = d instanceof Date ? d : new Date(d);
	return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
};

// Người nhận: chủ nhiệm/thư ký các đề tài đang thuộc đợt đó. Riêng mốc
// "Đăng ký đề tài" (topic_registration) chưa có đề tài nào để tra cứu thành
// viên ⇒ gửi cho mọi tài khoản có quyền tạo đề tài.
const getRecipients = async (pool, deadline) => {
	if (deadline.deadline_type === 'topic_registration') {
		const res = await pool.request().query(`
			SELECT DISTINCT u.id
			FROM users u
			INNER JOIN role_permissions rp ON rp.role_id = u.role_id
			INNER JOIN permissions p ON p.id = rp.permission_id
			WHERE u.is_active = 1
			  AND p.resource + ':' + p.action IN ('topics:create', 'system:manage')
		`);
		return res.recordset.map((r) => r.id);
	}
	const res = await pool
		.request()
		.input('round_id', sql.VarChar(10), deadline.round_id).query(`
			SELECT DISTINCT tm.user_id AS id
			FROM topic_members tm
			JOIN topics t ON t.id = tm.topic_id
			WHERE t.round_id = @round_id
			  AND tm.role IN ('leader', 'secretary')
			  AND tm.user_id IS NOT NULL
		`);
	return res.recordset.map((r) => r.id);
};

const run = async () => {
	const pool = await getPool();
	const today = todayVN();
	const upcomingDate = addDays(today, UPCOMING_DAYS_BEFORE);
	const overdueDate = addDays(today, -1);

	const deadlines = (
		await pool
			.request()
			.input('upcoming', sql.Date, upcomingDate)
			.input('overdue', sql.Date, overdueDate).query(`
				SELECT rd.id, rd.round_id, rd.name, rd.deadline_date, rd.deadline_type,
				       r.name AS round_name
				FROM round_deadlines rd
				JOIN research_rounds r ON r.id = rd.round_id
				WHERE CAST(rd.deadline_date AS DATE) IN (@upcoming, @overdue)
			`)
	).recordset;

	let sentCount = 0;
	for (const dl of deadlines) {
		const isUpcoming = dateOnly(dl.deadline_date).getTime() === upcomingDate.getTime();
		const kind = isUpcoming ? 'upcoming' : 'overdue';
		const dedupeKey = `${dl.id}:${kind}`;

		const firstTime = await markOnce('deadline_reminder', dedupeKey);
		if (!firstTime) continue; // đã nhắc rồi (job chạy lại do restart...)

		const userIds = await getRecipients(pool, dl);
		if (!userIds.length) continue;

		const title = isUpcoming
			? `Sắp tới hạn: ${dl.name}`
			: `Đã quá hạn: ${dl.name}`;
		const message = isUpcoming
			? `Mốc "${dl.name}" của đợt "${dl.round_name}" sẽ hết hạn trong ${UPCOMING_DAYS_BEFORE} ngày nữa.`
			: `Mốc "${dl.name}" của đợt "${dl.round_name}" đã quá hạn từ hôm qua.`;

		await notificationService.pushWithEmail('deadline_reminder', title, userIds, {
			message,
			refId: dl.round_id,
			refType: 'round',
		});
		sentCount += userIds.length;
	}

	if (sentCount > 0)
		console.log(`[job:deadline_reminder] Đã gửi ${sentCount} lượt nhắc deadline.`);
};

module.exports = { run };
