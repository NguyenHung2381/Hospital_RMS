import type { BadgeTone } from '@/shared/components/Badge/badgeTone';

/** Trạng thái học phí của 1 lượt ghi danh (tuitionService.summarize) */
export type TuitionState = 'no_fee' | 'exempt' | 'paid' | 'partial' | 'unpaid';
export type PaymentStatus = 'pending' | 'confirmed' | 'rejected';
export type PaymentMethod = 'transfer' | 'cash';

export const TUITION_STATE: Record<TuitionState, { label: string; tone: BadgeTone }> = {
	unpaid: { label: 'Chưa nộp', tone: 'red' },
	partial: { label: 'Nộp một phần', tone: 'amber' },
	paid: { label: 'Đã nộp đủ', tone: 'green' },
	exempt: { label: 'Miễn học phí', tone: 'blue' },
	no_fee: { label: 'Không thu', tone: 'gray' },
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: BadgeTone }> = {
	pending: { label: 'Chờ xác nhận', tone: 'amber' },
	confirmed: { label: 'Đã xác nhận', tone: 'green' },
	rejected: { label: 'Bị từ chối', tone: 'red' },
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
	transfer: 'Chuyển khoản',
	cash: 'Tiền mặt',
};

export interface TuitionPayment {
	id: string;
	enrollment_id: string;
	amount: number | string;
	method: PaymentMethod;
	status: PaymentStatus;
	paid_date: string;
	transfer_ref: string | null;
	note: string | null;
	review_note: string | null;
	reviewed_at: string | null;
	reviewer_name: string | null;
	receipt_no: string | null;
	created_at: string;
	/** Chứng từ học viên tải lên (tên cột file_url để server ký link tải) */
	file_name: string | null;
	file_url: string | null;
	proof_mime: string | null;
}

/** 1 lượt ghi danh kèm số phải nộp / đã nộp / còn lại và lịch sử nộp */
export interface TuitionItem {
	enrollment_id: string;
	enrollment_status: string;
	trainee_id: string;
	trainee_name: string;
	program_id: string | null;
	program_code: string | null;
	program_name: string | null;
	course_id: string;
	course_name: string;
	start_date: string | null;
	end_date: string | null;
	tuition_fee: number | string | null;
	discount_reason: string | null;
	base: number;
	discount: number;
	due: number;
	paid: number;
	pending: number;
	remaining: number;
	overpaid: number;
	state: TuitionState;
	/** Nội dung chuyển khoản riêng của lượt ghi danh — "HP <mã ghi danh>" */
	transfer_content: string;
	payments: TuitionPayment[];
}

/** Tài khoản nhận học phí (Cấu hình hệ thống); null = chưa cấu hình ⇒ không có QR */
export interface TuitionBank {
	bin: string;
	bank_name: string;
	account_no: string;
	account_name: string;
}

export interface MyTuition {
	bank: TuitionBank | null;
	items: TuitionItem[];
}

export interface PendingTuitionPayment {
	id: string;
	amount: number | string;
	paid_date: string;
	created_at: string;
	enrollment_id: string;
	course_id: string;
	course_name: string;
	trainee_name: string;
}

export const formatVnd = (n: number | string | null | undefined) =>
	`${Number(n ?? 0).toLocaleString('vi-VN')} đ`;
