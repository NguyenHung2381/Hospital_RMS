const systemSettingService = require('../modules/settings/systemSettingService');
const { getPool, sql } = require('../config/db');
const mailService = require('../modules/notifications/mailService');
const { consumeOnce } = require('../utils/oneTimeToken');

// Gửi email cảnh báo cho quản trị khi có sự kiện bảo mật quan trọng — trước đây
// chỉ ghi vào bảng security_events, không ai biết cho tới khi tự mở màn Nhật ký
// bảo mật. Người nhận: ALERT_EMAILS (phân cách dấu phẩy) nếu đặt, không thì email
// của mọi tài khoản superuser đang hoạt động. Dùng kênh email chung
// (mailService — bật bằng MAIL_ENABLED + SMTP_*).
//
// Chống spam: mỗi loại sự kiện (+ đối tượng) gửi tối đa 1 email / 30 phút.
// Không bao giờ throw — cảnh báo lỗi không được làm hỏng luồng chính.
const THROTTLE_SEC = 30 * 60;

// Sự kiện gửi ngay (mỗi lần xảy ra, sau chống spam)
const IMMEDIATE = {
	refresh_token_reuse: 'Phiên đăng nhập có dấu hiệu bị đánh cắp (refresh token bị dùng lại)',
	upload_malware_blocked: 'Chặn file upload chứa mã độc',
	role_permissions_changed: 'Thay đổi phân quyền của vai trò',
	role_cloned: 'Tạo vai trò mới bằng sao chép quyền',
	'2fa_disabled': 'Tắt xác thực 2 lớp',
	device_untrusted: 'Thu hồi thiết bị quen do nhập sai nhiều lần',
	password_reset_by_admin: 'Quản trị đặt lại mật khẩu người dùng',
	login_attack_mode: 'Phát hiện dội đăng nhập — bật chế độ chống tấn công (utils/loginShield.js)',
};

// Sự kiện chỉ cảnh báo khi xảy ra DỒN DẬP (dấu hiệu dò mật khẩu hàng loạt):
// ≥ threshold lần trong windowMin phút gần nhất, trên mọi tài khoản.
const BURST = {
	login_locked: { threshold: 5, windowMin: 15, title: 'Nhiều tài khoản bị khoá do sai mật khẩu liên tục' },
	login_2fa_failed: { threshold: 10, windowMin: 15, title: 'Nhiều lần nhập sai mã xác thực 2 lớp' },
};

const escapeHtml = (s) =>
	String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const recipients = async () => {
	const configured = await systemSettingService.getValue('ALERT_EMAILS');
	if (configured) {
		return configured.split(',').map((e) => e.trim()).filter(Boolean);
	}
	const pool = await getPool();
	const rows = (
		await pool.request().query(`
			SELECT DISTINCT u.email FROM users u
			JOIN roles r ON r.id = u.role_id
			WHERE r.is_superuser = 1 AND u.is_active = 1
			  AND u.email IS NOT NULL AND u.email NOT LIKE '%.local'
		`)
	).recordset;
	return rows.map((r) => r.email);
};

const countRecent = async (eventType, windowMin) => {
	const pool = await getPool();
	return (
		await pool
			.request()
			.input('type', sql.VarChar(50), eventType)
			.input('min', sql.Int, windowMin).query(`
				SELECT COUNT(*) AS n FROM security_events
				WHERE event_type = @type AND created_at > DATEADD(MINUTE, -@min, GETDATE())
			`)
	).recordset[0].n;
};

const render = (title, rows) => `
	<div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; color:#1f2937;">
		<h2 style="color:#b91c1c; margin-bottom: 4px;">⚠️ ${escapeHtml(title)}</h2>
		<table style="border-collapse: collapse; font-size: 14px; margin-top: 12px;">
			${rows
				.filter(([, v]) => v !== null && v !== undefined && v !== '')
				.map(
					([k, v]) =>
						`<tr><td style="padding:4px 12px 4px 0; color:#6b7280;">${escapeHtml(k)}</td><td style="padding:4px 0;">${escapeHtml(v)}</td></tr>`,
				)
				.join('')}
		</table>
		<p style="margin-top: 16px;">Kiểm tra chi tiết tại màn <strong>Nhật ký bảo mật</strong> của hệ thống.
		Nếu không phải thao tác của quản trị, hãy khoá tài khoản liên quan và đổi mật khẩu ngay.</p>
		<p style="color:#9ca3af; font-size:12px; margin-top:24px; border-top:1px solid #e5e7eb; padding-top:12px;">
			Email cảnh báo tự động — mỗi loại sự kiện gửi tối đa 1 lần / 30 phút.
		</p>
	</div>
`;

// Gọi sau khi sự kiện đã được ghi (securityEventService.log)
const notify = async (event) => {
	try {
		const { eventType } = event;
		let title = IMMEDIATE[eventType];
		let throttleKey = `${eventType}:${event.targetId ?? ''}`;
		let extra = [];

		if (!title && BURST[eventType]) {
			const rule = BURST[eventType];
			const n = await countRecent(eventType, rule.windowMin);
			if (n < rule.threshold) return;
			title = rule.title;
			throttleKey = eventType; // gộp mọi tài khoản thành 1 cảnh báo
			extra = [['Số lần trong ' + rule.windowMin + ' phút', n]];
		}
		if (!title) return;
		if (!(await consumeOnce('security-alert', throttleKey, THROTTLE_SEC))) return;

		const to = await recipients();
		if (!to.length) {
			console.warn(`[security-alert] Không có người nhận (ALERT_EMAILS / superuser có email) — bỏ qua: ${title}`);
			return;
		}
		await mailService.send({
			event: 'SECURITY_ALERT',
			to: to.join(', '),
			subject: `[RMS - Cảnh báo bảo mật] ${title}`,
			html: render(title, [
				['Sự kiện', eventType],
				['Thời điểm', new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })],
				['Người thực hiện', event.actorId],
				['Đối tượng', event.targetId ? `${event.targetType ?? ''} ${event.targetId}`.trim() : null],
				['Địa chỉ IP', event.ip],
				['Chi tiết', event.detail],
				...extra,
			]),
		});
	} catch (err) {
		console.error('❌ security alert failed:', err.message);
	}
};

module.exports = { notify, IMMEDIATE, BURST };
