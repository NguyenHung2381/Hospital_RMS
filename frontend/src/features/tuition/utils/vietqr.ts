/*
 * Mã VietQR (chuẩn EMVCo của NAPAS) cho chuyển khoản học phí — dựng chuỗi tại trình
 * duyệt, không gọi dịch vụ ngoài. App ngân hàng quét mã sẽ tự điền ngân hàng, số tài
 * khoản, số tiền và nội dung chuyển khoản.
 *
 *   00 Payload format "01"          01 Point of initiation "12" (mã động, có số tiền)
 *   38 Merchant account: 00 GUID "A000000727" · 01 (00 BIN · 01 số TK) · 02 "QRIBFTTA"
 *   53 Tiền tệ "704" (VND) · 54 Số tiền · 58 Quốc gia "VN"
 *   62 Additional data: 08 Nội dung chuyển khoản · 63 CRC16-CCITT (FFFF, đa thức 1021)
 */

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC16-CCITT-FALSE (khởi tạo 0xFFFF, đa thức 0x1021), 4 ký tự hex in hoa */
export const crc16 = (s: string) => {
	let crc = 0xffff;
	for (let i = 0; i < s.length; i++) {
		crc ^= s.charCodeAt(i) << 8;
		for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
	}
	return crc.toString(16).toUpperCase().padStart(4, '0');
};

/** Bỏ dấu tiếng Việt và ký tự lạ — nội dung chuyển khoản chỉ nên dùng ASCII */
export const asciiContent = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/g, 'd')
		.replace(/Đ/g, 'D')
		.replace(/[^A-Za-z0-9 ]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 50);

export function buildVietQr({
	bin,
	accountNo,
	amount,
	content,
}: {
	bin: string;
	accountNo: string;
	amount?: number;
	content?: string;
}) {
	const merchant = tlv('00', 'A000000727') + tlv('01', tlv('00', bin) + tlv('01', accountNo)) + tlv('02', 'QRIBFTTA');
	let body =
		tlv('00', '01') +
		tlv('01', amount ? '12' : '11') +
		tlv('38', merchant) +
		tlv('53', '704') +
		(amount ? tlv('54', String(Math.round(amount))) : '') +
		tlv('58', 'VN');
	const text = content ? asciiContent(content) : '';
	if (text) body += tlv('62', tlv('08', text));
	body += '6304';
	return body + crc16(body);
}
