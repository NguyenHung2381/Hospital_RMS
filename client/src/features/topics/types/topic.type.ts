// ─── TYPES ────────────────────────────────
export type TopicStatus =
	| 'submitted'
	| 'approved'
	| 'rejected'
	| 'supplement'
	| 'cancelled';
export type ArticleType = 'de_tai' | 'bai_bao';
export type MemberRole = 'leader' | 'secretary' | 'member';
export type ApvStatus = 'pending' | 'approved' | 'rejected';
export type DrawerTab = 'info' | 'members' | 'files';

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
	// derived / computed
	progress: number;
	member_count: number;
	my_role?: MemberRole;
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
	level_id: string;
	department_id: string;
	status: TopicStatus;
	article_type: ArticleType;
	doi: string;
	publish_date: string;
}

export interface FormErrors {
	[k: string]: string;
}
