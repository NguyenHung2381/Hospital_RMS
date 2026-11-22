// Kiểm tra body PUT /courses/registration-settings — các công tắc của form đăng ký khóa ĐTLT
// (registrationSettingsService.js). Mỗi lần gửi ít nhất 1 công tắc, giá trị đúng kiểu boolean.
const { body } = require('express-validator');

const SWITCHES = ['email_otp_required', 'doc_check_enabled'];

const updateRegistrationSettingsRules = [
	...SWITCHES.map((key) =>
		body(key).optional().isBoolean({ strict: true }).withMessage(`${key} phải là true/false`),
	),
	body()
		.custom((b) => SWITCHES.some((key) => typeof b?.[key] === 'boolean'))
		.withMessage('Cần ít nhất 1 cài đặt để lưu'),
];

module.exports = { updateRegistrationSettingsRules };
