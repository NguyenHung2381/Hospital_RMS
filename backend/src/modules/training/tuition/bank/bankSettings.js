/**
 * bankSettings.js — cấu hình tự đối soát học phí qua API ngân hàng
 * (Cấu hình hệ thống → Đào tạo → Kết nối ngân hàng).
 *
 *   TUITION_BANK_API_PROVIDER     bộ chuyển đổi đang dùng (providers/index.js); rỗng = tắt
 *   TUITION_BANK_API_SECRET       khóa bí mật kiểm chữ ký webhook (che khi đọc, không xuất file)
 *   TUITION_BANK_AUTO_CONFIRM     khớp đủ điều kiện thì tự xác nhận + cấp phiếu thu (mặc định bật);
 *                                 tắt ⇒ mọi giao dịch vào hàng chờ, gợi ý sẵn lượt ghi danh
 *   TUITION_BANK_API_ALLOWED_IPS  chỉ nhận webhook từ các IP / dải này (rỗng = không giới hạn IP,
 *                                 vẫn bắt buộc chữ ký)
 * Số tài khoản nhận (TUITION_ACCOUNT_NO, tuitionSettings.js) dùng để bỏ qua giao dịch của
 * tài khoản khác khi ngân hàng báo kèm số tài khoản.
 */
const systemSettingService = require('../../../settings/systemSettingService');
const { parseCidr, splitList } = require('../../../../utils/attendancePolicy');
const { getProvider } = require('./providers');

const MIN_SECRET = 16;

/** @returns {string | null} null = hợp lệ (khóa không thuộc module này cũng trả null) */
const validateSetting = (key, value) => {
	const v = String(value ?? '').trim();
	if (key === 'TUITION_BANK_API_PROVIDER')
		return !v || getProvider(v) ? null : 'Bộ kết nối ngân hàng không hợp lệ';
	if (key === 'TUITION_BANK_API_SECRET')
		return !v || v.length >= MIN_SECRET
			? null
			: `Khóa bí mật phải dài ít nhất ${MIN_SECRET} ký tự`;
	if (key === 'TUITION_BANK_API_ALLOWED_IPS') {
		const bad = splitList(v).filter((e) => !parseCidr(e));
		return bad.length ? `IP / dải IP không hợp lệ: ${bad.join(', ')}` : null;
	}
	return null;
};

/**
 * @returns {Promise<{ provider: string, secret: string, autoConfirm: boolean,
 *   ipRanges: any[], accountNo: string }>}
 */
const getConfig = async () => {
	const [provider, secret, auto, ips, accountNo] = await Promise.all([
		systemSettingService.getValue('TUITION_BANK_API_PROVIDER', ''),
		systemSettingService.getValue('TUITION_BANK_API_SECRET', ''),
		systemSettingService.getValue('TUITION_BANK_AUTO_CONFIRM', ''),
		systemSettingService.getValue('TUITION_BANK_API_ALLOWED_IPS', ''),
		systemSettingService.getValue('TUITION_ACCOUNT_NO', ''),
	]);
	return {
		provider: String(provider ?? '').trim(),
		secret: String(secret ?? ''),
		autoConfirm: auto !== 'false',
		ipRanges: splitList(String(ips ?? '')).map(parseCidr).filter(Boolean),
		accountNo: String(accountNo ?? '').replace(/\s+/g, ''),
	};
};

module.exports = { validateSetting, getConfig };
