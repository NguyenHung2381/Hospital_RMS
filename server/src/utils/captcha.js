const jwt = require('jsonwebtoken');

// CAPTCHA toán học không trạng thái (stateless) — không cần lưu session/DB,
// mirror cách access token JWT đã dùng: đáp án được ký kèm hạn 5 phút vào
// chính token trả về cho client, xác minh lại bằng cách verify chữ ký.
const CAPTCHA_TTL = '5m';

const generateCaptcha = () => {
	const a = Math.floor(Math.random() * 8) + 1;
	const b = Math.floor(Math.random() * 8) + 1;
	const token = jwt.sign({ answer: a + b }, process.env.JWT_SECRET, { expiresIn: CAPTCHA_TTL });
	return { token, question: `${a} + ${b} = ?` };
};

const verifyCaptcha = (token, answer) => {
	if (!token || answer === undefined || answer === null) return false;
	try {
		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		return Number(decoded.answer) === Number(answer);
	} catch {
		return false;
	}
};

module.exports = { generateCaptcha, verifyCaptcha };
