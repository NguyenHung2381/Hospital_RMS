/**
 * generic.js — webhook chung có chữ ký HMAC-SHA256: dùng khi ngân hàng / dịch vụ trung
 * gian gửi được theo định dạng này, hoặc làm khuôn để viết bộ chuyển đổi cho từng ngân
 * hàng (cùng giao diện verify / parse — xem providers/index.js).
 *
 * Yêu cầu:  POST /api/v1/bank-webhooks/generic   Content-Type: application/json
 *   X-Bank-Timestamp: <giây Unix lúc gửi>         lệch quá 5 phút ⇒ từ chối (chống gửi lại)
 *   X-Bank-Signature: <hex HMAC-SHA256(khóa bí mật, "<timestamp>.<body thô>")>
 *
 * Body: 1 giao dịch hoặc { "transactions": [ ... ] }, mỗi giao dịch:
 *   { "id": "mã giao dịch duy nhất phía ngân hàng", "amount": 1500000,
 *     "content": "HP DK202611050001", "account_no": "0011001234567",
 *     "time": "2026-11-27T10:15:00+07:00", "type": "credit" }
 *   type: "credit" (tiền vào, mặc định) | "debit" (tiền ra — bỏ qua).
 */
const crypto = require('crypto');

const MAX_SKEW_SEC = 300;

const header = (headers, name) => {
	const v = headers[name.toLowerCase()];
	return Array.isArray(v) ? v[0] : v;
};

const sign = (secret, timestamp, rawBody) =>
	crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

/**
 * @param {{ headers: Record<string, any>, rawBody: string, secret: string, now?: number }} input
 * @returns {string | null} null = hợp lệ; chuỗi = lý do từ chối (ghi log, không trả chi tiết ra ngoài)
 */
const verify = ({ headers, rawBody, secret, now = Date.now() }) => {
	if (!secret) return 'chưa cấu hình khóa bí mật';
	const ts = String(header(headers, 'x-bank-timestamp') ?? '');
	const sig = String(header(headers, 'x-bank-signature') ?? '').toLowerCase();
	if (!/^\d{9,11}$/.test(ts)) return 'thiếu / sai X-Bank-Timestamp';
	if (Math.abs(now / 1000 - Number(ts)) > MAX_SKEW_SEC) return 'X-Bank-Timestamp lệch quá 5 phút';
	if (!/^[0-9a-f]{64}$/.test(sig)) return 'thiếu / sai X-Bank-Signature';
	const expected = Buffer.from(sign(secret, ts, rawBody), 'hex');
	if (!crypto.timingSafeEqual(expected, Buffer.from(sig, 'hex'))) return 'sai chữ ký';
	return null;
};

/**
 * @param {any} body  JSON đã parse
 * @returns {import('./index').BankTxn[]}
 */
const parse = (body) => {
	const list = Array.isArray(body?.transactions) ? body.transactions : [body];
	return list.map((t) => ({
		external_id: t?.id,
		amount: t?.amount,
		content: t?.content,
		account_no: t?.account_no,
		time: t?.time,
		direction: t?.type === 'debit' ? 'debit' : 'credit',
		raw: t,
	}));
};

module.exports = { id: 'generic', label: 'Webhook chung (chữ ký HMAC-SHA256)', verify, parse, sign };
