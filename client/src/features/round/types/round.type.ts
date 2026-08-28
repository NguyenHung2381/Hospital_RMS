// ─── TYPES ────────────────────────────────
export type RoundStatus = 'draft' | 'active' | 'closed';

export type DeadlineType = 'edit' | 'supplement' | 'report_submission';

export const DEADLINE_TYPE_LABELS: Record<DeadlineType, string> = {
	edit: 'Sửa',
	supplement: 'Bổ sung',
	report_submission: 'Nộp báo cáo',
};

// Những mục mà chủ nhiệm / thư ký được phép chỉnh sửa trong cửa sổ "Bổ sung".
export type SupplementField = 'title' | 'description' | 'members' | 'files';

export const SUPPLEMENT_FIELDS: SupplementField[] = [
	'title',
	'description',
	'members',
	'files',
];

export const SUPPLEMENT_FIELD_LABELS: Record<SupplementField, string> = {
	title: 'Tên đề tài',
	description: 'Mô tả / thông tin',
	members: 'Thành viên',
	files: 'Tài liệu / File',
};

export interface RoundDeadline {
	id: string;
	round_id: string;
	phase: number;
	name: string;
	start_date?: string | null; // dd/mm/yyyy
	deadline_date: string; // dd/mm/yyyy
	deadline_type?: DeadlineType | null;
	/** Chỉ có ý nghĩa khi deadline_type === 'supplement'. null/[] ⇒ cho phép tất cả. */
	supplement_fields?: SupplementField[] | null;
}

export interface ResearchRound {
	id: string;
	name: string;
	year: number;
	round_number: number; // số thứ tự đợt trong năm
	round_type_id?: string | null; // FK round_types.id (RT01, RT02, ...)
	round_type_name?: string | null; // tên loại đợt (join từ round_types)
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
	round_type_id: string;
	start_date: string;
	end_date: string;
	status: RoundStatus;
}

export interface RoundType {
	id: string;
	name: string;
	description: string | null;
	created_at: string;
}

export interface FormErrors {
	[k: string]: string;
}
