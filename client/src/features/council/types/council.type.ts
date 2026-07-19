// ─── TYPES ────────────────────────────────
export type CouncilStatus = 'draft' | 'finalized';
export type CouncilSession = 'morning' | 'afternoon';
export type SeatRole =
	| 'chairman'
	| 'secretary'
	| 'reviewer1'
	| 'reviewer2'
	| 'member';

export const SEAT_ROLES: SeatRole[] = [
	'chairman',
	'secretary',
	'reviewer1',
	'reviewer2',
	'member',
];

export const SEAT_ROLE_LABELS: Record<SeatRole, string> = {
	chairman: 'Chủ tịch',
	secretary: 'Thư ký',
	reviewer1: 'Phản biện 1',
	reviewer2: 'Phản biện 2',
	member: 'Thành viên',
};

export const SESSION_LABELS: Record<CouncilSession, string> = {
	morning: 'Buổi sáng',
	afternoon: 'Buổi chiều',
};

export const STATUS_LABELS: Record<CouncilStatus, string> = {
	draft: 'Bản nháp',
	finalized: 'Chính thức',
};

export interface CouncilMember {
	id: string;
	council_id: string;
	role: SeatRole;
	user_id: string | null;
	external_reviewer_id: string | null;
	full_name: string;
	staff_number: number | null;
	department_id: string | null;
	department_name: string | null;
	ext_organization: string | null;
	is_external: boolean;
}

// Ứng viên cho 1 ghế — người trong viện (is_external=false, đủ trường nhân
// viên) hoặc người ngoài viện (is_external=true, chỉ có tên/đơn vị/liên hệ).
export interface EligibleUser {
	id: string;
	username?: string;
	full_name: string;
	staff_number?: number | null;
	department_id?: string | null;
	department_name?: string | null;
	specialty_group?: string | null;
	qualification?: string | null;
	can_sit_council?: boolean;
	can_chair_council?: boolean;
	is_author_conflict?: boolean;
	is_dept_conflict?: boolean;
	age?: number | null;
	is_external: boolean;
	organization?: string | null;
	phone?: string | null;
	email?: string | null;
}

// Người ngoài viện tham gia hội đồng chấm — hồ sơ nhẹ, không cần tài khoản
// đăng nhập, do admin quản lý riêng và chọn được khi xếp ghế hội đồng.
export interface ExternalReviewer {
	id: string;
	full_name: string;
	organization: string | null;
	specialty_group: string | null;
	phone: string | null;
	email: string | null;
	note: string | null;
	is_active: boolean;
	created_at: string;
}

export interface ExternalReviewerForm {
	full_name: string;
	organization: string;
	specialty_group: string;
	phone: string;
	email: string;
	note: string;
}

export const EMPTY_EXTERNAL_REVIEWER_FORM: ExternalReviewerForm = {
	full_name: '',
	organization: '',
	specialty_group: '',
	phone: '',
	email: '',
	note: '',
};

// Ghế thay thế theo đề tài: thay người ngồi một ghế khi chấm đề tài cụ thể
// (thành viên gốc là tác giả, hoặc cần chuyên gia đúng ngành phản biện).
export interface SeatSubstitute {
	topic_id: string;
	role: SeatRole;
	user_id: string;
	full_name: string;
	staff_number: number | null;
	department_id: string | null;
	department_name: string | null;
}

export interface CouncilTopic {
	id: string;
	title: string;
	status: string;
	session: CouncilSession | null; // buổi bảo vệ — hội đồng chấm cả 2 buổi/ngày
	department_id: string | null;
	department_name: string | null;
	substitutes?: SeatSubstitute[];
}

export interface Council {
	id: string;
	round_id: string;
	round_name?: string;
	name: string;
	specialty_group: string | null;
	location: string | null;
	defense_date: string | null; // dd/mm/yyyy
	status: CouncilStatus;
	topic_count?: number;
	member_count?: number; // số vai trò đã có người (tối đa 5 ghế)
	chairman_user_id?: string | null;
	chairman_name?: string | null;
	members_summary?: string | null; // "CT: Nguyễn A, TK: Trần B, ..." — xem nhanh không cần mở modal
	created_at: string;
	members?: CouncilMember[];
	topics?: CouncilTopic[];
}

export interface CouncilForm {
	round_id: string;
	name: string;
	specialty_group: string;
	location: string;
	defense_date: string; // yyyy-mm-dd (input[type=date])
	status: CouncilStatus;
}

export const EMPTY_FORM: CouncilForm = {
	round_id: '',
	name: '',
	specialty_group: '',
	location: '',
	defense_date: '',
	status: 'draft',
};

export type ModalType =
	| 'add'
	| 'edit'
	| 'delete'
	| 'detail'
	| 'bulk-edit'
	| 'bulk-delete'
	| 'auto-assign'
	| null;
