/**
 * bankMatch.js — phần tính toán thuần của tự đối soát (không DB): chuẩn hoá giao dịch ngân
 * hàng báo về, dò mã ghi danh trong nội dung chuyển khoản, quyết định làm gì với giao dịch.
 */

// Mã ghi danh: DK + yyyymmdd + 4 số (utils/idGenerator genCourseEnrollmentId)
const ENROLLMENT_CODE = 'DK\\d{12}';

/** Bỏ dấu, viết hoa, bỏ mọi ký tự không phải chữ / số — ngân hàng hay nuốt / thêm dấu cách. */
const squash = (s) =>
	String(s ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/gi, 'D')
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '');

/**
 * Mã ghi danh trong nội dung chuyển khoản. Ưu tiên "HP<mã>" (nội dung hệ thống gợi ý);
 * không có thì nhận mã ghi danh đứng một mình (người chuyển gõ thiếu "HP").
 * @returns {string[]} các mã khác nhau tìm được
 */
const extractCodes = (content) => {
	const s = squash(content);
	const withPrefix = [...s.matchAll(new RegExp(`HP(${ENROLLMENT_CODE})`, 'g'))].map((m) => m[1]);
	const found = withPrefix.length
		? withPrefix
		: [...s.matchAll(new RegExp(ENROLLMENT_CODE, 'g'))].map((m) => m[0]);
	return [...new Set(found)];
};

/**
 * Chuẩn hoá 1 giao dịch bộ chuyển đổi trả về. Giao dịch hỏng ⇒ { error }.
 * @param {import('./providers').BankTxn} t
 */
const normalizeTxn = (t) => {
	const externalId = String(t?.external_id ?? '').trim();
	if (!externalId || externalId.length > 100) return { error: 'mã giao dịch thiếu / quá dài' };
	const amount = Number(t.amount);
	if (!Number.isInteger(amount) || amount <= 0 || amount > 1e15)
		return { error: `số tiền không hợp lệ (${externalId})` };
	let time = null;
	if (t.time !== undefined && t.time !== null && t.time !== '') {
		const d = new Date(t.time);
		if (Number.isNaN(d.getTime())) return { error: `thời điểm không hợp lệ (${externalId})` };
		time = d;
	}
	return {
		txn: {
			external_id: externalId,
			amount,
			content: String(t.content ?? '').slice(0, 500),
			account_no: t.account_no ? String(t.account_no).replace(/\s+/g, '').slice(0, 30) : null,
			time,
			direction: t.direction === 'debit' ? 'debit' : 'credit',
		},
	};
};

/** Lý do chưa tự khớp — nhãn hiện ở hàng chờ (frontend giữ bản dịch riêng). */
const REASONS = {
	no_code: 'Nội dung không có mã ghi danh',
	ambiguous: 'Nội dung có nhiều mã ghi danh',
	not_found: 'Không có lượt ghi danh này',
	not_approved: 'Lượt ghi danh chưa được duyệt',
	no_fee: 'Khóa không thu học phí / đã miễn',
	overpay: 'Số tiền vượt số còn phải nộp',
	auto_off: 'Tự xác nhận đang tắt — chờ duyệt',
	wrong_account: 'Không phải tài khoản nhận học phí',
	error: 'Lỗi khi ghi nhận — thử gán lại',
};

/**
 * Quyết định cho 1 giao dịch đã dò ra lượt ghi danh (hoặc không).
 * @param {{ codes: string[], row: any | null, item: any | null, amount: number,
 *           autoConfirm: boolean, manual?: boolean }} input
 *   row / item: lượt ghi danh + tổng hợp học phí (tuitionService) của mã duy nhất, null nếu
 *   không có. manual = cán bộ tự gán (bỏ qua kiểm mã trong nội dung và công tắc tự xác nhận).
 * @returns {{ action: 'apply' } | { action: 'unmatched', reason: keyof typeof REASONS }}
 */
const decide = ({ codes, row, item, amount, autoConfirm, manual = false }) => {
	if (!manual) {
		if (!codes.length) return { action: 'unmatched', reason: 'no_code' };
		if (codes.length > 1) return { action: 'unmatched', reason: 'ambiguous' };
	}
	if (!row || !item) return { action: 'unmatched', reason: 'not_found' };
	if (row.enrollment_status !== 'approved') return { action: 'unmatched', reason: 'not_approved' };
	if (item.due <= 0) return { action: 'unmatched', reason: 'no_fee' };
	if (amount > item.remaining) return { action: 'unmatched', reason: 'overpay' };
	if (!manual && !autoConfirm) return { action: 'unmatched', reason: 'auto_off' };
	return { action: 'apply' };
};

module.exports = { squash, extractCodes, normalizeTxn, decide, REASONS };
