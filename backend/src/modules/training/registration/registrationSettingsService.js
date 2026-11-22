// Cài đặt form đăng ký khóa đào tạo công khai mà Phòng Đào tạo tự bật/tắt được ngay ở
// trang Khóa học (không cần quyền Cấu hình hệ thống). Lưu chung khóa của Cấu hình hệ thống
// (TRAINING_REGISTRATION_EMAIL_OTP, TRAINING_REGISTRATION_DOC_CHECK) nên hai nơi luôn hiển thị
// cùng một giá trị.
const systemSettingService = require('../../settings/systemSettingService');
const mailService = require('../../notifications/mailService');
const emailOtp = require('./registrationEmailOtpService');
const docCheckService = require('./docCheck/docCheckService');
const { tesseractAvailable } = require('./docCheck/docCheckAnalyzer');

/**
 * @returns {Promise<{ email_otp_required: boolean, mail_enabled: boolean,
 *   doc_check_enabled: boolean, doc_check_ocr: boolean }>}
 */
const get = async () => ({
	email_otp_required: await emailOtp.isRequired(),
	// Tắt gửi mail toàn hệ thống thì bật OTP cũng không ai nhận được mã — giao diện cảnh báo
	mail_enabled: await mailService.isEnabled(),
	// Tự kiểm tra loại file hồ sơ (OCR / QR) — TRAINING_REGISTRATION_DOC_CHECK
	doc_check_enabled: await docCheckService.isEnabled(),
	// Máy chủ có Tesseract không — không có thì chỉ kiểm được PDF có chữ + mã QR (giao diện nhắc)
	doc_check_ocr: await tesseractAvailable(),
});

/**
 * @param {{ email_otp_required?: boolean, doc_check_enabled?: boolean }} patch
 * @param {string} actorId
 */
const update = async (patch, actorId) => {
	if (typeof patch.email_otp_required === 'boolean')
		await systemSettingService.update(
			'TRAINING_REGISTRATION_EMAIL_OTP',
			String(patch.email_otp_required),
			actorId,
		);
	if (typeof patch.doc_check_enabled === 'boolean')
		await systemSettingService.update(
			'TRAINING_REGISTRATION_DOC_CHECK',
			String(patch.doc_check_enabled),
			actorId,
		);
	return get();
};

module.exports = { get, update };
