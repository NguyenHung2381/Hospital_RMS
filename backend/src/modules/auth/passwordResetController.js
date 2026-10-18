const passwordResetService = require('./passwordResetService');
const { success } = require('../../utils/response');

const forgot = async (req, res, next) => {
	try {
		await passwordResetService.requestOtp(req.body.username.trim());
		return success(
			res,
			null,
			'Nếu tài khoản có email, mã OTP đã được gửi. Mã có hiệu lực 10 phút.',
		);
	} catch (err) {
		next(err);
	}
};

const reset = async (req, res, next) => {
	try {
		const { username, code, new_password } = req.body;
		await passwordResetService.resetPassword(username.trim(), code, new_password);
		return success(res, null, 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.');
	} catch (err) {
		next(err);
	}
};

module.exports = { forgot, reset };
