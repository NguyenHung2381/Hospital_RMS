export type MergeStatus = 'PENDING' | 'MERGED' | 'REJECTED';
export type MergeReason = 'SAME_NAME_DOB' | 'SAME_NAME' | 'SAME_PHONE' | 'SAME_EMAIL' | 'SAME_STAFF_NUMBER';
export type Side = 'A' | 'B';

/** Trường được chọn giá trị khi gộp: 'keep' = giá trị của hồ sơ giữ lại, 'lose' = của hồ sơ bị gộp. */
export const MERGE_FIELDS = [
	'full_name',
	'date_of_birth',
	'gender',
	'national_id',
	'email',
	'phone',
	'is_internal',
] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];
export type FieldChoice = Partial<Record<MergeField, 'keep' | 'lose'>>;

export interface PersonRecord {
	source: string;
	ref_id: string;
	label: string;
}

export interface PersonSummary {
	id: string;
	full_name: string;
	date_of_birth: string | null;
	gender: string | null;
	national_id: string | null;
	email: string | null;
	phone: string | null;
	is_internal: boolean | null;
	is_verified: boolean;
	status: 'ACTIVE' | 'INACTIVE' | 'MERGED';
	origin_table: string | null;
	created_at: string;
	ref_count: number;
	has_account: boolean;
	/** Chỉ có ở API chi tiết */
	records?: PersonRecord[];
}

export interface MergeCandidate {
	id: number;
	reason: MergeReason;
	status: MergeStatus;
	note: string | null;
	created_at: string;
	reviewed_at: string | null;
	reviewed_by_name: string | null;
	a: PersonSummary;
	b: PersonSummary;
}

export interface MergeCandidateDetail extends MergeCandidate {
	blockers: string[];
	warnings: string[];
}

export interface MergeListResponse {
	data: MergeCandidate[];
	pagination: { page: number; limit: number; total: number };
}

export interface MergeStats {
	by_status: Record<MergeStatus, number>;
	pending_by_reason: Partial<Record<MergeReason, number>>;
}

export interface MergeResult {
	candidate_id: number;
	kept_id: string;
	merged_id: string;
	moved: Record<string, number>;
}

export const REASON_LABEL: Record<MergeReason, string> = {
	SAME_NAME_DOB: 'Trùng tên + ngày sinh',
	SAME_STAFF_NUMBER: 'Trùng mã nhân viên',
	SAME_EMAIL: 'Trùng email',
	SAME_PHONE: 'Trùng SĐT',
	SAME_NAME: 'Trùng tên',
};

export const REASON_TONE: Record<MergeReason, 'red' | 'amber' | 'blue' | 'gray' | 'purple'> = {
	SAME_NAME_DOB: 'red',
	SAME_STAFF_NUMBER: 'amber',
	SAME_EMAIL: 'blue',
	SAME_PHONE: 'purple',
	SAME_NAME: 'gray',
};

export const SOURCE_LABEL: Record<string, string> = {
	users: 'Tài khoản',
	trainees: 'Học viên',
	lecturers: 'Giảng viên',
	external_reviewers: 'Chuyên gia ngoài viện',
	topic_members: 'Thành viên đề tài',
	seminar_participants: 'Người dự hội thảo',
};

export const STATUS_TABS: { key: MergeStatus; label: string }[] = [
	{ key: 'PENDING', label: 'Chờ duyệt' },
	{ key: 'MERGED', label: 'Đã gộp' },
	{ key: 'REJECTED', label: 'Không phải cùng người' },
];
