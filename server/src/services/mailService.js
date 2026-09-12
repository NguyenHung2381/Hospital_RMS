const nodemailer = require('nodemailer');

// Kênh email tuỳ chọn (mirror MailHelper.php của hệ thống NCKH bệnh viện):
// mặc định TẮT (MAIL_ENABLED khác 'true') để không phá vỡ môi trường dev/test
// chưa cấu hình SMTP — chỉ log ra console. Bật thật bằng cách set SMTP_* +
// MAIL_ENABLED=true trong .env.
const isEnabled = () => process.env.MAIL_ENABLED === 'true';

let transporter = null;
const getTransporter = () => {
	if (transporter) return transporter;
	transporter = nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port: Number(process.env.SMTP_PORT) || 587,
		secure: process.env.SMTP_SECURE === 'true',
		auth: process.env.SMTP_USER
			? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
			: undefined,
	});
	return transporter;
};

// Không bao giờ throw ra ngoài — gửi email thất bại không được phép làm hỏng
// luồng chính (duyệt đề tài, nhắc deadline...).
const send = async ({ to, subject, html }) => {
	if (!to) return;
	if (!isEnabled()) {
		console.log(`[mail] MAIL_ENABLED != true — bỏ qua gửi email tới ${to}: "${subject}"`);
		return;
	}
	try {
		await getTransporter().sendMail({
			from: process.env.SMTP_FROM || process.env.SMTP_USER,
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
