import type { CustomValues } from '../../../shared/formConfig/types';

// ─── TYPES ────────────────────────────────
export type TopicStatus =
	| 'submitted'
	| 'approved'
	| 'rejected'
	| 'supplement'
	| 'cancelled';
export type ArticleType = 'de_tai' | 'bai_bao';
/** Xếp loại nghiệm thu — đề tài nhập bổ sung (đã hoàn thành). */
export type AcceptanceRating = 'xuat_sac' | 'tot' | 'kha' | 'dat' | 'khong_dat';
export type MemberRole = 'leader' | 'secretary' | 'member';
export type ApvStatus = 'pending' | 'approved' | 'rejected';
export type DrawerTab = 'info' | 'members' | 'files' | 'authors';

export interface TopicFile {
	id: string;
	topic_id: string;
	file_name: string;
	file_size: number;
	file_url: string;
	mime_type: string;
	batch_id: string | null;
	is_deleted: boolean;
	created_by: string;
	created_at: string;
	uploaded_by_name: string;
	batch_note: string | null;
}

export interface Topic {
	id: string;
	title: string;
	description: string | null;
	round_id: string;
	round_name?: string;
	round_year?: number;
	category_id: string;
	level_id: string;
	department_id: string;
	status: TopicStatus;
	created_at: string;
	created_by: string;
	updated_at?: string;
	article_type?: ArticleType;
	journal_name?: string | null;
	doi?: string | null;
	publish_date?: string | null;
	budget_estimated?: number | null;
	budget_actual?: number | null;
	approval_decision_no?: string | null;
	approval_decision_date?: string | null;
	recognition_decision_no?: string | null;
	recognition_decision_date?: string | null;
	/** Đưa đề tài này vào trang công khai "Thư viện đề tài" — chỉ có hiệu lực
	 * khi status='approved' (lọc thêm ở publicPortalService.getFeaturedTopics). */
	is_featured?: boolean;
	/** Đề tài đã hoàn thành, nhập bổ sung ở cổng nhân viên (đợt cũ trước khi có hệ thống). */
	is_legacy?: boolean;
	/** Giá trị trường tùy chỉnh (trang Cấu hình form) */
	custom?: CustomValues;
	acceptance_rating?: AcceptanceRating | null;
	acceptance_score?: number | null;
	acceptance_date?: string | null;
	// derived / computed
	progress: number;
	member_count: number;
	my_role?: MemberRole;
	/** Hành động hợp lệ theo status + quyền của actor hiện tại — tính sẵn ở
	 * backend (topicService.computeAllowedActions), không tự suy luận theo
	 * status ở frontend. Có thể trong số: approve, reject, request_supplement,
	 * submit, grant_accounts. */
	allowed_actions?: string[];
}

export interface TopicMember {
	id: string;
	topic_id: string;
	ho_ten: string;
	email: string;
	so_dien_thoai: string | null;
	chuc_vu: string | null;
	staff_number: number | null;
	department_id: string | null;
	department_name?: string | null;
	role: MemberRole;
	user_id: string | null;
	account_granted: boolean;
	username: string | null;
	account_expires_at: string | null;
	has_existing_account: boolean;
	/** Trường tùy chỉnh (Cấu hình form 'topic_member') */
	custom?: CustomValues;
}

export interface TopicProgress {
	id: string;
	topic_id: string;
	status: string;
	note: string | null;
	created_at: string;
	created_by: string;
}

export interface Approval {
	id: string;
	topic_id: string;
	status: ApvStatus;
	comment: string | null;
	created_at: string;
	created_by: string;
}

export interface TopicForm {
	title: string;
	description: string;
	round_id: string;
	category_id: string;
	department_id: string;
	status: TopicStatus;
	article_type: ArticleType;
	journal_name: string;
	doi: string;
	publish_date: string;
	budget_estimated: string;
	budget_actual: string;
	approval_decision_no: string;
	approval_decision_date: string;
	recognition_decision_no: string;
	recognition_decision_date: string;
	acceptance_rating: AcceptanceRating | '';
	acceptance_score: string;
	acceptance_date: string;
	is_featured: boolean;
	/** Giá trị trường tùy chỉnh (trang Cấu hình form) */
	custom?: CustomValues;
}

export interface FormErrors {
	[k: string]: string;
}

export interface TopicAuthor {
	id: string;
	topic_id: string;
	author_name: string;
	affiliation: string | null;
	author_order: number;
	is_corresponding: boolean;
}
