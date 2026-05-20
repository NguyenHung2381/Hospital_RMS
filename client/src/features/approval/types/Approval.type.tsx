// ─── TYPES ────────────────────────────────
export type ApvStatus = 'pending' | 'approved' | 'rejected' | 'info_requested';
export type TopicLevel = string;
export type ModalType = 'approve' | 'reject' | 'request' | null;
export type TabKey = 'pending' | 'approved' | 'rejected' | 'info_requested';

export interface ApprovalRecord {
	id: string;
	topic_id: string;
	topic_title: string;
	topic_description: string;
	topic_level: TopicLevel;
	topic_category: string;
	topic_dept: string;
	topic_round: string;
	topic_member_count: number;
	status: ApvStatus;
	comment: string | null;
	created_at: string; // ngày nộp
	created_by: string; // người nộp (chủ nhiệm)
	updated_at: string | null;
	updated_by: string | null;
	// derived
	is_urgent: boolean; // nộp > 3 ngày chưa duyệt
	history: ApvHistoryItem[];
	members: ApprovalMember[];
}

export interface ApvHistoryItem {
	action: ApvStatus;
	comment: string | null;
	actor: string;
	at: string;
}

export interface ApprovalMember {
	name: string;
	role: 'Chủ nhiệm' | 'Thư ký' | 'Thành viên' | 'Cố vấn';
	dept: string;
}
