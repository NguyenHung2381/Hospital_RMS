const nodemailer = require('nodemailer');
const systemSettingService = require('./systemSettingService');

// Kênh email tuỳ chọn (mirror MailHelper.php của hệ thống NCKH bệnh viện):
// mặc định TẮT (MAIL_ENABLED khác 'true') để không phá vỡ môi trường dev/test
// chưa cấu hình SMTP — chỉ log ra console. Bật bằng set SMTP_* + MAIL_ENABLED=true
// trong .env HOẶC qua màn "Cấu hình hệ thống" (system_settings, 2026-09-14) —
// giá trị trong DB ưu tiên hơn nếu admin đã cấu hình qua UI.
const isEnabled = async () => (await systemSettingService.getValue('MAIL_ENABLED')) === 'true';

// Không cache transporter — số lượng email gửi thấp (notification/deadline),
// đổi lấy việc thay đổi cấu hình SMTP qua UI có hiệu lực ngay, không cần restart.
const getTransporter = async () => {
	const [host, port, secure, user, pass] = await Promise.all([
		systemSettingService.getValue('SMTP_HOST'),
		systemSettingService.getValue('SMTP_PORT'),
		systemSettingService.getValue('SMTP_SECURE'),
		systemSettingService.getValue('SMTP_USER'),
		systemSettingService.getValue('SMTP_PASS'),
	]);
	return nodemailer.createTransport({
		host,
		port: Number(port) || 587,
		secure: secure === 'true' || secure === 'ssl',
		auth: user ? { user, pass } : undefined,
	});
};

// Không bao giờ throw ra ngoài — gửi email thất bại không được phép làm hỏng
// luồng chính (duyệt đề tài, nhắc deadline...).
const send = async ({ to, subject, html }) => {
	if (!to) return;
	if (!(await isEnabled())) {
		console.log(`[mail] MAIL_ENABLED != true — bỏ qua gửi email tới ${to}: "${subject}"`);
		return;
	}
	try {
		const fromName = await systemSettingService.getValue('SMTP_FROM_NAME');
		const fromUser = await systemSettingService.getValue('SMTP_USER');
		const transporter = await getTransporter();
		await transporter.sendMail({
			from: fromName && fromUser ? `"${fromName}" <${fromUser}>` : process.env.SMTP_FROM || fromUser,
			to,
			subject,
			html,
		});
	} catch (err) {
		console.error(`❌ Gửi email thất bại tới ${to}:`, err.message);
	}
};

const renderNotificationEmail = ({ fullName, title, message }) => `
	<div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color:#1f2937;">
		<h2 style="color:#1a6abd; margin-bottom: 4px;">${escapeHtml(title)}</h2>
		<p>Xin chào ${escapeHtml(fullName || 'bạn')},</p>
		${message ? `<p style="white-space: pre-line;">${escapeHtml(message)}</p>` : ''}
		<p style="color:#9ca3af; font-size:12px; margin-top:24px; border-top:1px solid #e5e7eb; padding-top:12px;">
			Đây là email tự động từ Hệ thống Quản lý NCKH. Vui lòng không trả lời email này.
		</p>
	</div>
`;

const escapeHtml = (s) =>
	String(s ?? '').replace(/[&<>"']/g, (c) => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;',
	})[c]);

module.exports = { send, renderNotificationEmail, isEnabled };
