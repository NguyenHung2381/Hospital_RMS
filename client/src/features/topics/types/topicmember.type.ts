export type MemberRole = 'chu_nhiem' | 'thu_ky' | 'thanh_vien' | 'co_van';
export type TopicStatus =
	| 'draft'
	| 'submitted'
	| 'approved'
	| 'rejected'
	| 'supplement'
	| 'in_progress'
	| 'completed';
export type ModalType = 'add' | 'edit' | 'delete' | 'grant' | 'bulkApprove' | 'bulkReject' | null;

export interface TopicMember {
	id: string;
	topic_id: string;
	ho_ten: string;
	email: string;
	so_dien_thoai: string | null;
	chuc_vu: string | null;
	staff_number: string | null;
	role: MemberRole;
	user_id: string | null;
	account_granted: boolean;
	account_granted_at: string | null;
	has_existing_account: boolean;
	created_at: string;
	created_by: string;
}

export interface Topic {
	id: string;
	title: string;
	status: TopicStatus;
	department_name: string;
	round_name: string;
	member_count: number;
}

export interface MemberFormData {
	ho_ten: string;
	email: string;
	so_dien_thoai: string;
	chuc_vu: string;
	staff_number: string;
	role: MemberRole;
}