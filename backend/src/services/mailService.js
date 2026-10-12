const path = require('path');
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
const send = async ({ to, subject, html, attachments }) => {
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
			attachments,
		});
	} catch (err) {
		console.error(`❌ Gửi email thất bại tới ${to}:`, err.message);
	}
};

// Gửi thử cho trang cấu hình: bỏ qua MAIL_ENABLED (admin đang kiểm tra SMTP trước
// khi bật) và throw lỗi thật để UI hiển thị.
const sendTest = async (to) => {
	const [fromName, fromUser] = await Promise.all([
		systemSettingService.getValue('SMTP_FROM_NAME'),
		systemSettingService.getValue('SMTP_USER'),
	]);
	await (await getTransporter()).sendMail({
		from: fromName && fromUser ? `"${fromName}" <${fromUser}>` : process.env.SMTP_FROM || fromUser,
		to,
		subject: 'Email thử từ Hệ thống RMS',
		html: '<p>Cấu hình SMTP hoạt động.</p>',
	});
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

// Logo nhúng trực tiếp (cid) — hiển thị được cả khi mail client chặn ảnh từ xa.
const LOGO_ATTACHMENT = {
	filename: 'logo.png',
	path: path.join(__dirname, '../assets/mail-logo.png'),
	cid: 'rms-logo',
};

// Email OTP: bố cục bảng + style inline (Outlook/Gmail không đọc <style>/flex),
// rộng 560px, màu theo giao diện hệ thống (#0a9b4a).
const renderOtpEmail = ({ fullName, code, ttlMin, resetUrl }) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
	<tr><td align="center">
		<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
			<tr><td align="center" style="background:#0a9b4a;padding:24px 16px;">
				<img src="cid:rms-logo" width="64" height="64" alt="Logo" style="display:block;border:0;margin:0 auto 10px;background:#ffffff;border-radius:50%;">
				<div style="color:#ffffff;font-size:18px;font-weight:bold;">Hệ thống Quản lý NCKH &amp; Đào tạo</div>
			</td></tr>
			<tr><td style="padding:32px 32px 8px;">
				<h2 style="margin:0 0 16px;font-size:20px;color:#087c3b;">Đặt lại mật khẩu</h2>
				<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Xin chào ${escapeHtml(fullName || 'bạn')},</p>
				<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Vui lòng bấm nút bên dưới và nhập mã xác nhận này:</p>
			</td></tr>
			<tr><td align="center" style="padding:0 32px;">
				<div style="display:inline-block;background:#ecfdf3;border:1px dashed #0a9b4a;border-radius:10px;padding:16px 28px;font-size:34px;font-weight:bold;letter-spacing:10px;color:#087c3b;font-family:'Courier New',monospace;">${escapeHtml(code)}</div>
			</td></tr>
			<tr><td align="center" style="padding:4px 32px 8px;">
				<a href="${escapeHtml(resetUrl)}" target="_blank" style="display:inline-block;background:#0a9b4a;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 32px;border-radius:8px;">Đặt lại mật khẩu</a>
				<p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#6b7280;word-break:break-all;">Nếu nút không bấm được, mở liên kết:<br><a href="${escapeHtml(resetUrl)}" style="color:#087c3b;">${escapeHtml(resetUrl)}</a></p>
			</td></tr>
			<tr><td style="padding:20px 32px 28px;">
				<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#4b5563;">Mã có hiệu lực trong <strong>${ttlMin} phút</strong> và chỉ dùng được cho yêu cầu này. Tuyệt đối không chia sẻ mã cho bất kỳ ai.</p>
				<p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn vẫn được giữ nguyên.</p>
			</td></tr>
			<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;font-size:12px;line-height:1.6;color:#9ca3af;text-align:center;">
				Đây là email tự động từ Hệ thống Quản lý NCKH &amp; Đào tạo. Vui lòng không trả lời email này.
			</td></tr>
		</table>
	</td></tr>
</table>
`;

const escapeHtml = (s) =>
	String(s ?? '').replace(/[&<>"']/g, (c) => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;',
	})[c]);

module.exports = { send, sendTest, renderNotificationEmail, renderOtpEmail, LOGO_ATTACHMENT, isEnabled };
