export type ModalType = 'add' | 'edit' | 'delete' | 'detail' | null;
export type CourseStatus = 'draft' | 'open' | 'closed' | 'completed' | 'cancelled';
export type EnrollmentStatus = 'pending' | 'approved' | 'rejected' | 'waitlisted';
export type AttendanceStatus = 'present' | 'absent' | 'late';

export interface Course {
	id: string;
	name: string;
	program_id: string | null;
	program_name: string | null;
	training_round_id: string | null;
	training_round_name: string | null;
	training_form_id: string | null;
	training_form_name: string | null;
	start_date: string | null;
	end_date: string | null;
	capacity: number | null;
	status: CourseStatus;
	description: string | null;
	enrollment_count: number;
	approved_count: number;
	pending_count: number;
	created_at: string;
}

export interface CourseFormData {
	name: string;
	program_id: string;
	training_round_id: string;
	training_form_id: string;
	start_date: string;
	end_date: string;
	capacity: string;
	status: CourseStatus;
	description: string;
}

export interface CourseListResponse {
	data: Course[];
	pagination: { page: number; limit: number; total: number };
}

export const EMPTY_FORM: CourseFormData = {
	name: '',
	program_id: '',
	training_round_id: '',
	training_form_id: '',
	start_date: '',
	end_date: '',
	capacity: '',
	status: 'draft',
	description: '',
};

export const STATUS_CFG: Record<CourseStatus, { label: string; color: string; bg: string }> = {
	draft: { label: 'Nháp', color: '#633806', bg: '#faeeda' },
	open: { label: 'Đang mở', color: '#085041', bg: '#e1f5ee' },
	closed: { label: 'Đã đóng', color: 'var(--color-gray-600)', bg: 'var(--color-gray-100)' },
	completed: { label: 'Hoàn thành', color: '#0c447c', bg: '#e6f1fb' },
	cancelled: { label: 'Đã huỷ', color: '#791f1f', bg: '#fcebeb' },
};

export const ENROLLMENT_STATUS_CFG: Record<EnrollmentStatus, { label: string; color: string; bg: string }> = {
	pending: { label: 'Chờ duyệt', color: '#633806', bg: '#faeeda' },
	approved: { label: 'Đã duyệt', color: '#085041', bg: '#e1f5ee' },
	rejected: { label: 'Từ chối', color: '#791f1f', bg: '#fcebeb' },
	waitlisted: { label: 'Danh sách chờ', color: '#3c3489', bg: '#eeedfe' },
};

export interface Enrollment {
	id: string;
	course_id: string;
	trainee_id: string;
	trainee_name: string;
	trainee_phone: string | null;
	trainee_email: string | null;
	status: EnrollmentStatus;
	registered_at: string;
	decided_by: string | null;
	decided_by_name: string | null;
	decided_at: string | null;
	note: string | null;
}

export interface LecturerAssignment {
	id: string;
	course_id: string;
	lecturer_id: string;
	lecturer_name: string;
	specialty: string | null;
	subject_id: string | null;
	subject_name: string | null;
	note: string | null;
}

export interface ClassSession {
	id: string;
	course_id: string;
	subject_id: string | null;
	subject_name: string | null;
	lecturer_id: string | null;
	lecturer_name: string | null;
	session_date: string;
	start_time: string | null;
	end_time: string | null;
	room: string | null;
}

export interface AttendanceRow {
	enrollment_id: string;
	trainee_name: string;
	attendance_id: string | null;
	status: AttendanceStatus | null;
	note: string | null;
}

export type DocType = 'material' | 'test_question' | 'test_answer';

export const DOC_TYPE_CFG: Record<DocType, string> = {
	material: 'Tài liệu',
	test_question: 'Đề kiểm tra',
	test_answer: 'Đáp án',
};

export interface CourseDocument {
	id: string;
	doc_type: DocType;
	title: string;
	is_public: boolean;
	created_at: string;
	file_name: string;
	file_url: string;
	mime_type: string | null;
	file_size: number | null;
}

export interface Grade {
	id: string;
	enrollment_id: string;
	trainee_name: string;
	subject_id: string | null;
	subject_name: string | null;
	score: number | null;
	result: string | null;
	note: string | null;
}

export interface Certificate {
	id: string;
	enrollment_id: string;
	trainee_name: string;
	cert_no: string;
	issue_date: string;
	file_name: string | null;
	file_url: string | null;
}
