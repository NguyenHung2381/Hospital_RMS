/**
 * tuitionSettings.js — tài khoản nhận học phí (Cấu hình hệ thống → Đào tạo → Học phí).
 * Thiếu ngân hàng hoặc số tài khoản ⇒ getBankInfo() = null: cổng học viên không hiện
 * mã QR (vẫn xem được khoản phải nộp và nộp tại quầy).
 */
const systemSettingService = require('../../settings/systemSettingService');

// Mã BIN (NAPAS) dùng trong mã VietQR — các ngân hàng phổ biến; khớp danh sách chọn ở
// frontend/src/features/settings/pages/SystemSettings.tsx (TUITION_BANK_BIN).
const BANKS = {
	970436: 'Vietcombank',
	970415: 'VietinBank',
	970418: 'BIDV',
	970405: 'Agribank',
	970407: 'Techcombank',
	970422: 'MB Bank',
	970416: 'ACB',
	970432: 'VPBank',
	970403: 'Sacombank',
	970423: 'TPBank',
	970443: 'SHB',
	970437: 'HDBank',
	970441: 'VIB',
	970448: 'OCB',
	970440: 'SeABank',
	970426: 'MSB',
	970431: 'Eximbank',
	970449: 'LPBank',
	970428: 'Nam A Bank',
	970409: 'Bac A Bank',
};

const DEFAULT_RECEIPT_UNIT = 'Trung tâm Đào tạo và Chỉ đạo tuyến';

/** @returns {Promise<{ bin: string, bank_name: string, account_no: string, account_name: string } | null>} */
const getBankInfo = async () => {
	const [bin, accountNo, accountName] = await Promise.all([
		systemSettingService.getValue('TUITION_BANK_BIN', ''),
		systemSettingService.getValue('TUITION_ACCOUNT_NO', ''),
		systemSettingService.getValue('TUITION_ACCOUNT_NAME', ''),
	]);
	const b = String(bin ?? '').trim();
	const no = String(accountNo ?? '').replace(/\s+/g, '');
	if (!/^\d{6}$/.test(b) || !/^[0-9A-Za-z]{4,19}$/.test(no)) return null;
	return {
		bin: b,
		bank_name: BANKS[b] ?? `Ngân hàng (BIN ${b})`,
		account_no: no,
		account_name: String(accountName ?? '')
			.trim()
			.toUpperCase(),
	};
};

/** Tên đơn vị thu in trên phiếu thu. */
const receiptUnit = async () =>
	String(
		(await systemSettingService.getValue('TUITION_RECEIPT_UNIT', '')) || DEFAULT_RECEIPT_UNIT,
	).trim();

module.exports = { BANKS, getBankInfo, receiptUnit };
