export type ModalType = 'add' | 'edit' | 'delete' | null;
// courses.status giờ chỉ còn lưu cờ huỷ ('cancelled' vs 'draft' = bình thường)
// — mọi trạng thái khác (sắp khai giảng/đang mở đăng ký/đang học/hoàn thành)
// được suy ra tự động từ ngày tháng, xem CourseDisplayStatus.
export type CourseStatus = 'draft' | 'cancelled';
export type CourseDisplayStatus = 'upcoming' | 'enrolling' | 'in_progress' | 'completed' | 'cancelled';
export type EnrollmentStatus = 'pending' | 'approved' | 'rejected' | 'waitlisted';
export type AttendanceStatus = 'present' | 'absent' | 'late';

export interface Course {
	id: string;
	name: string;
	program_names: string | null;
	program_ids: string[];
	training_form_id: string | null;
	training_form_name: string | null;
	training_type_id: string | null;
	training_type_name: string | null;
	batch_no: number | null;
	/** Khóa mở liên tục (GPHN): không có ngày khóa/cửa sổ đăng ký, học viên có lịch riêng. */
	is_rolling: boolean;
	start_date: string | null;
	end_date: string | null;
	enrollment_start_date: string | null;
	enrollment_end_date: string | null;
	enrollment_open: boolean;
	capacity: number | null;
	status: CourseStatus;
	display_status: CourseDisplayStatus;
	is_public_registration: boolean;
	description: string | null;
	prerequisites: string[];
	objectives: string[];
	enrollment_count: number;
	approved_count: number;
	pending_count: number;
	created_at: string;
}

export interface CourseFormData {
	name: string;
	program_ids: string[];
	training_form_id: string;
	training_type_id: string;
	batch_no: string;
	is_rolling: boolean;
	start_date: string;
	end_date: string;
	enrollment_start_date: string;
	enrollment_end_date: string;
	capacity: string;
	status: CourseStatus;
	is_public_registration: boolean;
	description: string;
	prerequisites: string[];
	objectives: string[];
}

export interface CourseListResponse {
	data: Course[];
	pagination: { page: number; limit: number; total: number };
}

export const EMPTY_FORM: CourseFormData = {
	name: '',
	program_ids: [],
	training_form_id: '',
	training_type_id: '',
	batch_no: '',
	is_rolling: false,
	start_date: '',
	end_date: '',
	enrollment_start_date: '',
	enrollment_end_date: '',
	capacity: '',
	status: 'draft',
	is_public_registration: false,
	description: '',
	prerequisites: [],
	objectives: [],
};

// Loại khóa = loại hình đào tạo (training_types); id cố định do migration
// 2026-11-07_training_course_types_rotations tạo.
export const TRAINING_TYPE = {
	GPHN: 'TRNTP-GPHN',
	DTLT: 'TRNTP-DTLT',
} as const;

export const DISPLAY_STATUS_CFG: Record<CourseDisplayStatus, { label: string; color: string; bg: string }> = {
	upcoming: { label: 'Sắp khai giảng', color: '#633806', bg: '#faeeda' },
	enrolling: { label: 'Đang mở đăng ký', color: '#085028', bg: '#e1f5ea' },
	in_progress: { label: 'Đang trong quá trình học', color: '#3c3489', bg: '#eeedfe' },
	completed: { label: 'Hoàn thành', color: '#0c447c', bg: '#e6f1fb' },
	cancelled: { label: 'Đã huỷ', color: '#791f1f', bg: '#fcebeb' },
};

export const ENROLLMENT_STATUS_CFG: Record<EnrollmentStatus, { label: string; color: string; bg: string }> = {
	pending: { label: 'Chờ duyệt', color: '#633806', bg: '#faeeda' },
	approved: { label: 'Đã duyệt', color: '#085028', bg: '#e1f5ea' },
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
	/** Chương trình học viên chọn khi ghi danh (1 trong các chương trình của khóa). */
	program_id: string | null;
	program_code: string | null;
	program_name: string | null;
	lesson_total: number;
	lesson_done: number;
	// Hồ sơ thực hành GPHN (các cột của sổ thực hành)
	practice_code: string | null;
	professional_field: string | null;
	practice_form: string | null;
	start_date: string | null;
	end_date: string | null;
	total_duration: string | null;
	practice_location: string | null;
	sending_unit: string | null;
	main_mentor_user_id: string | null;
	main_mentor_name: string | null;
	progress_status: ProgressStatus;
	progress_date: string | null;
	progress_reason: string | null;
}

export type ProgressStatus = 'in_progress' | 'completed' | 'dropped';
export const PROGRESS_LABEL: Record<ProgressStatus, string> = {
	in_progress: 'Đang học',
	completed: 'Đã hoàn thành',
	dropped: 'Nghỉ học',
};

export type EnrollmentLessonStatus = 'not_started' | 'in_progress' | 'done';
export const LESSON_STATUS_LABEL: Record<EnrollmentLessonStatus, string> = {
	not_started: 'Chưa học',
	in_progress: 'Đang học',
	done: 'Đã học',
};

/** Bài học tự gắn cho học viên theo chương trình đã chọn (ĐTLT). */
export interface EnrollmentLesson {
	lesson_id: string;
	code: string;
	title: string;
	display_order: number;
	status: EnrollmentLessonStatus;
	completed_at: string | null;
	total_hours: number;
	credits: number;
}

/** Trường sửa được của 1 lượt ghi danh (PUT /courses/enrollments/:id). */
export type EnrollmentUpdate = Partial<
	Pick<
		Enrollment,
		| 'program_id'
		| 'practice_code'
		| 'professional_field'
		| 'practice_form'
		| 'start_date'
		| 'end_date'
		| 'total_duration'
		| 'practice_location'
		| 'sending_unit'
		| 'progress_status'
		| 'progress_date'
		| 'progress_reason'
		| 'note'
	>
>;

// ─── Vòng thực hành GPHN của 1 hồ sơ (khoa, ngày, người hướng dẫn) ─────────
export type RotationResult = 'pending' | 'pass' | 'fail';
export const ROTATION_RESULT_LABEL: Record<RotationResult, string> = {
	pending: 'Đang / chưa thực hành',
	pass: 'Đạt',
	fail: 'Không đạt',
};

export interface EnrollmentRotation {
	id: string;
	enrollment_id: string;
	lesson_id: string | null;
	round_title: string | null;
	round_code: string | null;
	allow_split: boolean | null;
	seq: number;
	department_id: string | null;
	department_name: string | null;
	start_date: string | null;
	end_date: string | null;
	duration_text: string | null;
	mentor_user_id: string | null;
	// Bản chụp người hướng dẫn lúc phân công
	mentor_name: string | null;
	mentor_salutation: string | null;
	mentor_staff_no: string | null;
	mentor_dob: string | null;
	mentor_qualification: string | null;
	mentor_license_no: string | null;
	mentor_license_date: string | null;
	mentor_phone: string | null;
	mentor_scope: string | null;
	result: RotationResult;
	attempt_no: number;
	note: string | null;
	/** Khoa được chọn của vòng (rỗng = không giới hạn). */
	allowed_department_ids: string[];
	warnings: string[];
}

export interface RotationRound {
	id: string;
	code: string;
	title: string;
	duration_value: number | null;
	duration_unit: 'day' | 'week' | 'month' | null;
	allow_split: boolean;
	department_ids: string[];
}

export interface RotationList {
	rows: EnrollmentRotation[];
	rounds: RotationRound[];
	max_mentor_load: number;
}

export type RotationUpdate = Partial<
	Pick<
		EnrollmentRotation,
		'department_id' | 'start_date' | 'end_date' | 'duration_text' | 'mentor_user_id' | 'mentor_salutation' | 'result' | 'note'
	>
>;

/** Người hướng dẫn tìm được (GET /staff-licenses/mentors). */
export interface MentorOption {
	user_id: string;
	staff_number: number | null;
	full_name: string;
	qualification: string | null;
	license_no: string | null;
	practice_scope: string | null;
	department_name: string | null;
}

/** Chương trình đào tạo áp dụng cho khóa (chọn trong form khóa học). */
export interface CourseProgramLink {
	id: string;
	course_id: string;
	program_id: string;
	program_name: string;
	program_code: string | null;
	training_type_id: string | null;
	program_duration: string | null;
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

export type ExamType = 'thuong_xuyen' | 'giua_ky' | 'cuoi_ky' | 'on_tap';

export const EXAM_TYPE_CFG: Record<ExamType, string> = {
	thuong_xuyen: 'Thường xuyên',
	giua_ky: 'Giữa kỳ',
	cuoi_ky: 'Cuối kỳ',
	on_tap: 'Ôn tập',
};

export type SourceType = 'file' | 'link';

export interface CourseDocument {
	id: string;
	doc_type: DocType;
	title: string;
	is_public: boolean;
	exam_type: ExamType | null;
	download_count: number;
	created_at: string;
	source_type: SourceType;
	external_url: string | null;
	file_name: string | null;
	file_url: string | null;
	mime_type: string | null;
	file_size: number | null;
}

export interface Grade {
	id: string;
	enrollment_id: string;
	trainee_name: string;
	subject_id: string | null;
	subject_name: string | null;
	program_id: string | null;
	program_name: string | null;
	score: number | null;
	result: string | null;
	regular_score: number | null;
	midterm_score: number | null;
	final_score: number | null;
	classification: string | null;
	note: string | null;
}

export type CertificateStatus = 'active' | 'revoked';

export interface Certificate {
	id: string;
	enrollment_id: string;
	trainee_name: string;
	cert_no: string;
	issue_date: string;
	expiry_date: string | null;
	status: CertificateStatus;
	revoked_at: string | null;
	revoke_reason: string | null;
	file_name: string | null;
	file_url: string | null;
}
