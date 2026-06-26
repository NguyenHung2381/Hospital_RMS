// ─── TYPES ────────────────────────────────
export type RoundStatus = 'draft' | 'active' | 'closed';

export type DeadlineType =
	| 'registration'
	| 'supplement'
	| 'report_submission'
	| 'council_submission';

export const DEADLINE_TYPE_LABELS: Record<DeadlineType, string> = {
	registration: 'Đăng ký',
	supplement: 'Bổ sung',
	report_submission: 'Nộp báo cáo',
	council_submission: 'Nộp HĐ',
};

export interface RoundDeadline {
	id: string;
	round_id: string;
	phase: number;
	name: string;
	start_date?: string | null; // dd/mm/yyyy
	deadline_date: string; // dd/mm/yyyy
	deadline_type?: DeadlineType | null;
}

export interface ResearchRound {
	id: string;
	name: string;
	year: number;
	round_number: number; // số thứ tự đợt trong năm
	start_date: string; // dd/mm/yyyy
	end_date: string;
	status: RoundStatus;
	public_token: string;
	created_at: string;
	created_by: string;
	updated_at?: string;
	// derived (join topics)
	topic_total: number;
	topic_active: number;
	topic_completed: number;
	topic_pending: number;
}

export interface RoundForm {
	name: string;
	year: number;
	round_number: number;
	start_date: string;
	end_date: string;
	status: RoundStatus;
}

export interface FormErrors {
	[k: string]: string;
}
