import type { BadgeTone } from '@/shared/components/Badge/badgeTone';

// Tự đối soát học phí qua API ngân hàng (backend training/tuition/bank/)

export type BankTxnStatus = 'unmatched' | 'matched' | 'ignored';
export type BankTxnReason =
	| 'no_code'
	| 'ambiguous'
	| 'not_found'
	| 'not_approved'
	| 'no_fee'
	| 'overpay'
	| 'auto_off'
	| 'wrong_account'
	| 'error';

// Chờ xử lý dùng hồng (= "việc đang chờ bạn") — chỉ ở trạng thái chưa khớp
export const BANK_TXN_STATUS: Record<BankTxnStatus, { label: string; tone: BadgeTone }> = {
	unmatched: { label: 'Chờ xử lý', tone: 'pink' },
	matched: { label: 'Đã ghi nhận', tone: 'green' },
	ignored: { label: 'Bỏ qua', tone: 'gray' },
};

// Khớp bankMatch.REASONS ở backend
export const BANK_TXN_REASON: Record<BankTxnReason, string> = {
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

export interface BankTxn {
	id: string;
	provider: string;
	external_id: string;
	account_no: string | null;
	amount: string | number;
	content: string | null;
	txn_time: string | null;
	status: BankTxnStatus;
	reason: BankTxnReason | null;
	/** Lượt ghi danh đã ghi nhận — hoặc gợi ý (dò được nhưng chưa tự khớp) */
	enrollment_id: string | null;
	payment_id: string | null;
	note: string | null;
	received_at: string;
	handled_at: string | null;
	handled_by_name: string | null;
	receipt_no: string | null;
	trainee_name: string | null;
	course_id: string | null;
	course_name: string | null;
}

export interface BankTxnList {
	items: BankTxn[];
	counts: Record<BankTxnStatus, number>;
	limit: number;
	offset: number;
}

export interface BankPreview {
	codes: string[];
	action: 'apply' | 'unmatched';
	reason: BankTxnReason | null;
	reason_text: string | null;
	enrollment: {
		enrollment_id: string;
		trainee_name: string;
		course_name: string;
		due: number;
		paid: number;
		pending: number;
		remaining: number;
	} | null;
}

export interface BankStatus {
	provider: string | null;
	has_secret: boolean;
	auto_confirm: boolean;
	ip_limited: boolean;
	last_received_at: string | null;
	unmatched: number;
}
