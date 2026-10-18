const passwordResetService = require('./passwordResetService');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

const forgot = asyncHandler(async (req, res) => {
	await passwordResetService.requestOtp(req.body.username.trim());
	return success(res, null, 'Nếu tài khoản có email, mã OTP đã được gửi. Mã có hiệu lực 10 phút.');
});

const reset = asyncHandler(async (req, res) => {
	const { username, code, new_password } = req.body;
	await passwordResetService.resetPassword(username.trim(), code, new_password);
	return success(res, null, 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.');
});

module.exports = { forgot, reset };
