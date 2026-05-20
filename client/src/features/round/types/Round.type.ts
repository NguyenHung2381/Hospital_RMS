// ─── TYPES ────────────────────────────────
export type RoundStatus = 'draft' | 'active' | 'closed';

export type DeadlineType = 'nop_bao_cao' | 'xet_duyet' | 'nghiem_thu';

export const DEADLINE_TYPE_LABELS: Record<DeadlineType, string> = {
	nop_bao_cao: 'Nộp báo cáo',
	xet_duyet: 'Xét duyệt',
	nghiem_thu: 'Nghiệm thu',
};

export interface RoundDeadline {
	id: string;
	round_id: string;
	phase: number;
	name: string;
	start_date?: string | null;   // dd/mm/yyyy
	deadline_date: string;        // dd/mm/yyyy
	deadline_type?: DeadlineType | null;
}

export interface ResearchRound {
	id: string;
	name: string;
	year: number;
	dot_so: number; // số thứ tự đợt trong năm
	start_date: string; // dd/mm/yyyy
	end_date: string;
	registration_start_date?: string | null; // dd/mm/yyyy
	registration_end_date?: string | null;   // dd/mm/yyyy
	supplement_start_date?: string | null;   // dd/mm/yyyy
	supplement_end_date?: string | null;     // dd/mm/yyyy
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
	dot_so: number;
	start_date: string;
	end_date: string;
	registration_start_date: string;
	registration_end_date: string;
	status: RoundStatus;
}

export interface FormErrors {
	[k: string]: string;
}
