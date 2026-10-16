// ─── Hội thảo / Hội nghị & CME ────────────────────────────────────────────────

export type SeminarScope = 'external' | 'hosted';
export type SeminarEventType =
	| 'conference'
	| 'sci_seminar'
	| 'intl_seminar'
	| 'sci_conference'
	| 'training'
	| 'other';
export type ParticipationType =
	| 'attendee'
	| 'speaker'
	| 'chair'
	| 'organizer'
	| 'trainee';
export type ParticipantSource = 'internal' | 'external';
export type CmeStatus = 'none' | 'pending' | 'issued' | 'signed';

export const SCOPE_LABELS: Record<SeminarScope, string> = {
	external: 'Đơn vị ngoài tổ chức (cử người dự)',
	hosted: 'Bệnh viện tổ chức',
};

export const EVENT_TYPE_LABELS: Record<SeminarEventType, string> = {
	conference: 'Hội nghị',
	sci_seminar: 'Hội thảo khoa học',
	intl_seminar: 'Hội thảo quốc tế',
	sci_conference: 'Hội nghị khoa học',
	training: 'Tập huấn',
	other: 'Khác',
};

export const PARTICIPATION_LABELS: Record<ParticipationType, string> = {
	attendee: 'Đại biểu',
	speaker: 'Báo cáo viên',
	chair: 'Chủ tọa',
	organizer: 'Ban tổ chức',
	trainee: 'Học viên',
};

export const SOURCE_LABELS: Record<ParticipantSource, string> = {
	internal: 'Nội viện',
	external: 'Ngoại viện',
};

export const CME_STATUS_LABELS: Record<CmeStatus, string> = {
	none: 'Chưa cấp',
	pending: 'Chờ cấp',
	issued: 'Đã cấp',
	signed: 'Đã ký nhận',
};

export interface SeminarParticipant {
	id: string;
	seminar_id: string;
	user_id: string | null;
	title_prefix: string | null;
	full_name: string;
	dob: string | null;
	dob_text: string | null;
	gender: string | null;
	organization: string | null;
	department_raw: string | null;
	staff_number: number | null;
	qualification_raw: string | null;
	source: ParticipantSource;
	is_foreign: boolean;
	participation_type: ParticipationType;
	cme_year: number | null;
	cme_seq: number | null;
	cme_certificate_no: string | null;
	cme_credits: number | null;
	cme_status: CmeStatus;
	cme_issued_date: string | null;
	notes: string | null;
	phone: string | null;
	email: string | null;
	/** Có = tự đăng ký qua QR (phải điểm danh + làm bài test mới được cấp CME) */
	ticket_code: string | null;
	checked_in_at: string | null;
	test_correct: number | null;
	test_total: number | null;
	test_submitted_at: string | null;
	user_full_name?: string | null;
	user_staff_number?: number | null;
	user_department_name?: string | null;
}

export interface Seminar {
	id: string;
	title: string;
	event_type: SeminarEventType;
	event_type_raw: string | null;
	scope: SeminarScope;
	location: string | null;
	start_date: string | null;
	end_date: string | null;
	/** 'HH:mm' — giờ bắt đầu (ngày start_date) / kết thúc (ngày end_date) */
	start_time: string | null;
	end_time: string | null;
	date_text: string | null;
	event_year: number | null;
	host_chair: string | null;
	speakers: string | null;
	permit_doc_no: string | null;
	co_organizers: string | null;
	grants_cme: boolean;
	cme_default_credits: number | null;
	coordinator: string | null;
	notes: string | null;
	manual_participant_count: number | null;
	manual_internal_count: number | null;
	manual_external_count: number | null;
	manual_foreign_count: number | null;
	manual_cme_count: number | null;
	/** Mã trong link/QR đăng ký công khai /hoi-nghi/<public_token> */
	public_token: string | null;
	/** JSON SeminarTestQuestion[] */
	test_questions: string | null;
	test_open: boolean;
	/** Khung giờ làm bài test — trống ngày = ngày kết thúc (hoặc bắt đầu) hội nghị */
	test_date: string | null;
	test_start_time: string | null;
	test_end_time: string | null;
	/** JSON SeminarAgendaItem[] — chương trình / danh sách bài học */
	agenda: string | null;
	created_at: string;
	participant_count?: number;
	cme_issued_count?: number;
	internal_count?: number;
	external_count?: number;
	foreign_count?: number;
	participants?: SeminarParticipant[];
}

export interface SeminarTestQuestion {
	q: string;
	/** Ảnh minh hoạ (link /uploads đã ký) */
	image?: string | null;
	options: string[];
	/** Chỉ số phương án đúng */
	answer: number;
}

/** Một bài học / bài báo cáo trong chương trình hội nghị */
export interface SeminarAgendaItem {
	title: string;
	speaker?: string;
	/** YYYY-MM-DD — hội nghị nhiều ngày */
	date?: string;
	start_time?: string;
	end_time?: string;
	note?: string;
}

export interface SeminarListResponse {
	data: Seminar[];
	pagination: { page: number; limit: number; total: number };
}

export interface SeminarForm {
	title: string;
	event_type: SeminarEventType;
	scope: SeminarScope;
	location: string;
	start_date: string;
	end_date: string;
	start_time: string;
	end_time: string;
	date_text: string;
	event_year: string;
	host_chair: string;
	speakers: string;
	permit_doc_no: string;
	co_organizers: string;
	coordinator: string;
	grants_cme: boolean;
	cme_default_credits: string;
	manual_participant_count: string;
	manual_internal_count: string;
	manual_external_count: string;
	manual_foreign_count: string;
	manual_cme_count: string;
	notes: string;
}

export const EMPTY_SEMINAR_FORM: SeminarForm = {
	title: '',
	event_type: 'conference',
	scope: 'external',
	location: '',
	start_date: '',
	end_date: '',
	start_time: '',
	end_time: '',
	date_text: '',
	event_year: String(new Date().getFullYear()),
	host_chair: '',
	speakers: '',
	permit_doc_no: '',
	co_organizers: '',
	coordinator: '',
	grants_cme: false,
	cme_default_credits: '',
	manual_participant_count: '',
	manual_internal_count: '',
	manual_external_count: '',
	manual_foreign_count: '',
	manual_cme_count: '',
	notes: '',
};

export interface ParticipantForm {
	user_id: string | null;
	title_prefix: string;
	full_name: string;
	dob: string;
	dob_text: string;
	gender: string;
	organization: string;
	department_raw: string;
	staff_number: string;
	qualification_raw: string;
	source: ParticipantSource;
	is_foreign: boolean;
	participation_type: ParticipationType;
	cme_credits: string;
	notes: string;
}

export const EMPTY_PARTICIPANT_FORM: ParticipantForm = {
	user_id: null,
	title_prefix: '',
	full_name: '',
	dob: '',
	dob_text: '',
	gender: '',
	organization: '',
	department_raw: '',
	staff_number: '',
	qualification_raw: '',
	source: 'internal',
	is_foreign: false,
	participation_type: 'attendee',
	cme_credits: '',
	notes: '',
};

export interface CmeRegisterEntry {
	id: string;
	cme_year: number;
	cme_seq: number;
	cme_certificate_no: string;
	title_prefix: string | null;
	full_name: string;
	dob: string | null;
	dob_text: string | null;
	gender: string | null;
	organization: string | null;
	source: ParticipantSource;
	participation_type: ParticipationType;
	cme_credits: number | null;
	cme_status: CmeStatus;
	cme_issued_date: string | null;
	notes: string | null;
	seminar_id: string;
	seminar_title: string;
}

export interface CmeRegister {
	year: number;
	last_seq: number;
	entries: CmeRegisterEntry[];
	pagination: { page: number; limit: number; total: number };
}

export interface CmeStats {
	year: number;
	last_seq: number | null;
	total: number;
	speakers: number;
	attendees: number;
	internal_count: number;
	external_count: number;
	signed_count: number;
	total_credits: number;
}

export type SeminarModal = 'add' | 'edit' | 'delete' | null;

// ─── Nhập Excel người tham dự ────────────────────────────────────────────────
export interface ParticipantImportRow {
	row: number;
	raw_name: string;
	title_prefix: string | null;
	full_name: string;
	dob: string | null;
	dob_text: string | null;
	gender: string | null;
	organization: string | null;
	department_raw: string | null;
	staff_number: number | null;
	qualification_raw: string | null;
	cme_credits: number | null;
	/** Nguồn số tín chỉ: ô trong file, mặc định theo vai trò, hoặc chưa có. */
	credits_source?: 'file' | 'default' | null;
	participation_type: ParticipationType;
	source: ParticipantSource;
	is_foreign: boolean;
	matched_user: {
		id: string;
		full_name: string;
		department_name: string | null;
	} | null;
	warnings: string[];
}

export interface ParticipantImportResult {
	dry_run: boolean;
	rows?: ParticipantImportRow[];
	summary?: {
		total: number;
		matched: number;
		internal: number;
		external: number;
		with_credits: number;
	};
	inserted?: number;
	cme_issued?: number;
	cme_from?: number | null;
	cme_to?: number | null;
	cme_year?: number | null;
	warnings: string[];
}

// ─── Nhập Excel danh sách hội thảo ───────────────────────────────────────────
export interface SeminarListImportRow {
	row: number;
	title: string;
	event_type: SeminarEventType;
	event_type_raw: string | null;
	scope: SeminarScope;
	start_date: string | null;
	end_date: string | null;
	date_text: string | null;
	event_year: number | null;
	location: string | null;
	grants_cme: boolean;
	cme_default_credits: number | null;
	manual_participant_count: number | null;
	warnings: string[];
	errors: string[];
	duplicate: boolean;
}

export interface SeminarListImportResult {
	dry_run: boolean;
	summary: { total: number; importable: number; duplicates: number; invalid: number };
	rows?: SeminarListImportRow[];
	inserted?: number;
	failures?: string[];
}
