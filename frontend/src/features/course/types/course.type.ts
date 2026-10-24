export type ModalType = 'add' | 'edit' | 'delete' | null;
// courses.status giờ chỉ còn lưu cờ huỷ ('cancelled' vs 'draft' = bình thường)
// — mọi trạng thái khác (sắp khai giảng/đang mở đăng ký/đang học/hoàn thành)
// được suy ra tự động từ ngày tháng, xem CourseDisplayStatus.
export type CourseStatus = 'draft' | 'cancelled';
export type CourseDisplayStatus =
	| 'upcoming'
	| 'enrolling'
	| 'in_progress'
	| 'completed'
	| 'cancelled';
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
	status: CourseStatus;
	display_status: CourseDisplayStatus;
	is_public_registration: boolean;
	description: string | null;
	prerequisites: string[];
	objectives: string[];
	enrollment_count: number;
	approved_count: number;
	pending_count: number;
	waitlisted_count: number;
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
	status: CourseStatus;
	is_public_registration: boolean;
	description: string;
	prerequisites: string[];
	objectives: string[];
}

export interface CourseListResponse {
	data: Course[];
	pagination: { page: number; limit: number; total: number };
	/** Số bản ghi theo loại khóa (key '' = tất cả) — cho thanh tab. */
	type_counts?: Record<string, number>;
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
	CTCV: 'TRNTP-CTCV',
} as const;

/** Loại khóa chia lớp theo chương trình (backend programClassService): sĩ số + ngày học đặt theo lớp. */
export const CLASS_TYPES = new Set<string>([TRAINING_TYPE.DTLT, TRAINING_TYPE.CTCV]);

/** Tab loại khóa trên trang Khóa học & Học viên ('' = tất cả). */
export const TRAINING_TYPE_TABS: { id: string; label: string }[] = [
	{ id: '', label: 'Tất cả' },
	{ id: TRAINING_TYPE.GPHN, label: 'Giấy phép hành nghề' },
	{ id: TRAINING_TYPE.DTLT, label: 'Đào tạo liên tục' },
	{ id: TRAINING_TYPE.CTCV, label: 'Cầm tay chỉ việc' },
];

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
	/** Số dòng vòng thực hành GPHN đã sinh — 0 = hồ sơ chưa xếp lịch. */
	rotation_total: number;
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
	/** Vị trí trong danh sách chờ đợt sau (khóa tuyển sinh). */
	waitlist_position?: number | null;
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
/** mentor: người hướng dẫn tự đánh giá (cổng nhân viên) · staff: Phòng Đào tạo nhập hộ */
export type RotationResultSource = 'mentor' | 'staff';
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
	/** Nhận xét khi đánh giá + ai nhập (NHD tự đánh giá / Phòng Đào tạo nhập hộ), lúc nào */
	result_comment?: string | null;
	result_at?: string | null;
	result_source?: RotationResultSource | null;
	result_by_name?: string | null;
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
	/** Số vòng Đạt ở hồ sơ khác của cùng học viên có thể công nhận sang hồ sơ này. */
	previous_passed: number;
}

export type RotationUpdate = Partial<
	Pick<
		EnrollmentRotation,
		'department_id' | 'start_date' | 'end_date' | 'duration_text' | 'mentor_user_id' | 'mentor_salutation' | 'result' | 'result_comment' | 'note'
	>
>;

// ─── Hồ sơ thực hành GPHN trên mọi khóa (GET /courses/practice-records) ────
/** Giai đoạn hồ sơ theo luồng: duyệt → xếp lịch → thực hành → kết thúc; other = từ chối / danh sách chờ. */
export type PracticeStage = 'pending' | 'unscheduled' | 'practicing' | 'completed' | 'dropped' | 'other';
export const PRACTICE_STAGE_LABEL: Record<PracticeStage, string> = {
	pending: 'Chờ duyệt',
	unscheduled: 'Chưa xếp lịch',
	practicing: 'Đang thực hành',
	completed: 'Hoàn thành',
	dropped: 'Nghỉ học',
	other: 'Từ chối / chờ',
};
export interface PracticeRecordRow {
	id: string;
	course_id: string;
	course_name: string;
	trainee_id: string;
	trainee_name: string;
	trainee_phone: string | null;
	is_internal: boolean;
	status: EnrollmentStatus;
	progress_status: ProgressStatus | null;
	practice_code: string | null;
	program_id: string | null;
	program_code: string | null;
	program_name: string | null;
	start_date: string | null;
	end_date: string | null;
	sending_unit: string | null;
	registered_at: string;
	stage: PracticeStage;
	rotation_total: number;
	rotation_passed: number;
	rotation_failed: number;
	/** Vòng đã qua ngày kết thúc mà chưa có kết quả (chờ NHD đánh giá). */
	rotation_awaiting: number;
	/** Vòng đang diễn ra hôm nay. */
	current_round: string | null;
	current_department_id: string | null;
	current_department: string | null;
	current_mentor_user_id: string | null;
	current_mentor: string | null;
	current_end_date: string | null;
	/** Vòng kế tiếp (hôm nay chưa vào vòng nào / giữa 2 vòng). */
	next_round: string | null;
	next_department: string | null;
	next_start_date: string | null;
}

// ─── Tổng hợp thực hành GPHN theo ngày (GET /courses/practice-board) ───────
export interface PracticeBoardRow {
	id: string;
	enrollment_id: string;
	round_title: string | null;
	seq: number;
	attempt_no: number;
	result: RotationResult;
	department_id: string | null;
	department_name: string | null;
	current_department_name: string | null;
	start_date: string;
	end_date: string;
	duration_text: string | null;
	mentor_user_id: string | null;
	mentor_name: string | null;
	mentor_license_no: string | null;
	course_id: string;
	course_name: string;
	practice_code: string | null;
	progress_status: ProgressStatus;
	trainee_id: string;
	trainee_name: string;
	program_id: string | null;
	program_code: string | null;
	program_name: string | null;
}

/** Nhóm theo khoa; key rỗng = vòng chưa chọn khoa. */
export interface PracticeBoardDepartment {
	key: string;
	department_id: string | null;
	name: string;
	trainee_count: number;
	rows: PracticeBoardRow[];
}

/** Nhóm theo người hướng dẫn; key rỗng = vòng chưa phân công NHD. */
export interface PracticeBoardMentor {
	key: string;
	mentor_user_id: string | null;
	name: string;
	trainee_count: number;
	over_limit: boolean;
	departments: string[];
	rows: PracticeBoardRow[];
}

export interface PracticeBoard {
	date: string;
	max_mentor_load: number;
	departments: PracticeBoardDepartment[];
	mentors: PracticeBoardMentor[];
	summary: {
		trainee_count: number;
		department_count: number;
		mentor_count: number;
		over_limit_count: number;
		unassigned_mentor_count: number;
	};
}

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
	/** Khóa ĐTLT / CTCV: mỗi chương trình là 1 lớp — đủ class_min học viên đã duyệt thì cán bộ
	 *  bấm "Mở lớp" (class_opened_at, mở rồi mới xếp lịch); quá class_max thì hồ sơ vào danh
	 *  sách chờ của chương trình (class_waiting, tính trên mọi khóa). */
	class_rule: boolean;
	class_min: number;
	/** null = không giới hạn */
	class_max: number | null;
	class_opened_at: string | null;
	/** Ngày học của lớp (đặt khi mở lớp, sửa được); ngày khóa = sớm nhất → muộn nhất các lớp. */
	class_start: string | null;
	class_end: string | null;
	class_approved: number;
	class_waiting: number;
}

export type LecturerRole = 'main' | 'assistant';

export interface LecturerAssignment {
	id: string;
	course_id: string;
	lecturer_id: string;
	lecturer_name: string;
	specialty: string | null;
	/** Bài học (program_lessons); null = phân công cả khóa */
	subject_id: string | null;
	subject_name: string | null;
	role: LecturerRole;
	/** Số tiết đảm nhận trong bài */
	hours: number | null;
	note: string | null;
}

/** Bài học thuộc chương trình của khóa — 1 dòng của bảng Bài học × Giảng viên */
export interface CourseLesson {
	id: string;
	code: string | null;
	title: string;
	theory_hours: number | null;
	practice_hours: number | null;
	total_hours: number | null;
	program_name: string;
}

export interface LessonLecturersInput {
	main: { lecturer_id: string; hours?: number | null } | null;
	assistants: { lecturer_id: string; hours?: number | null }[];
}

export type SessionKind = 'theory' | 'practice';

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
	/** Buổi lý thuyết / thực hành — tính chuyên cần LT/TH; null = theo loại bài học */
	session_kind: SessionKind | null;
	/** Buổi khác cùng GV, cùng ngày, chồng giờ ("Khóa X 08:00–10:00; …") — chỉ cảnh báo */
	lecturer_clashes: string | null;
}

export interface AttendanceRow {
	enrollment_id: string;
	trainee_name: string;
	/** Lớp (chương trình) học viên ghi danh — chỉ học viên của lớp có buổi này mới có trong danh sách */
	program_code: string | null;
	program_name: string | null;
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

// ─── Bảng điểm Lý thuyết + Thực hành (giai đoạn 4, GET /courses/:id/gradebook) ──
export type GradePart = 'theory' | 'practice';
/** Phần thi cuối khóa của chương trình (training_programs.exam_parts) */
export type ExamParts = GradePart | 'both';
export type GradeFlag = 'absent' | 'exempt';
export const GRADE_FLAG_LABEL: Record<GradeFlag, string> = { absent: 'Vắng thi', exempt: 'Miễn thi' };

/** Ngưỡng chấm — Cấu hình hệ thống → Đào tạo (mặc định theo Phụ lục III TT 32/2023). */
export interface GradeRules {
	theoryPassPct: number;
	practicePassPct: number;
	theoryMaxAbsentPct: number;
	practiceMaxAbsentPct: number;
	maxRetakes: number;
	rankExcellent: number;
	rankGood: number;
	rankAverage: number;
}

export interface GradePartResult {
	applies: boolean;
	score: number | null;
	flag: GradeFlag | null;
	passed: boolean | null;
	absentPct: number | null;
	attendanceOk: boolean | null;
}

export interface GradebookRow {
	enrollment_id: string;
	trainee_id: string;
	trainee_name: string;
	program_id: string | null;
	program_name: string | null;
	theory_hours: number | null;
	practice_hours: number | null;
	/** Phần thi của chương trình; null = suy theo số tiết */
	exam_parts: ExamParts | null;
	grade_id: string | null;
	theory_score: number | null;
	practice_score: number | null;
	theory_flag: GradeFlag | null;
	practice_flag: GradeFlag | null;
	theory_attempt: number;
	practice_attempt: number;
	/** Điểm kiểm tra đầu vào (thang 10) — chỉ tham khảo, không tính vào kết quả */
	entrance_score?: number | null;
	note: string | null;
	locked_at: string | null;
	locked_by_name: string | null;
	certificate_id: string | null;
	cert_no: string | null;
	certificate_status: CertificateStatus | null;
	attendance: Record<GradePart, { held: number; absent: number }>;
	computed: {
		/** null = còn thiếu điểm */
		result: 'pass' | 'fail' | null;
		total: number | null;
		classification: string | null;
		theory: GradePartResult;
		practice: GradePartResult;
		reasons: string[];
	};
}

export interface Gradebook {
	rules: GradeRules;
	/** Phần người xem được nhập (GV chỉ phần mình được phân) */
	access: Record<GradePart, boolean>;
	locked: boolean;
	rows: GradebookRow[];
}

/** 1 dòng gửi PUT .../grades/bulk — trường không gửi thì giữ nguyên. */
export interface GradeBulkRow {
	enrollment_id: string;
	theory_score?: number | null;
	practice_score?: number | null;
	theory_flag?: GradeFlag | null;
	practice_flag?: GradeFlag | null;
	note?: string | null;
}

export interface GradeHistoryItem {
	id: number;
	part: GradePart;
	attempt_no: number;
	score: number | null;
	flag: GradeFlag | null;
	source: 'manual' | 'exam' | 'import' | 'retake' | 'unlock';
	note: string | null;
	changed_at: string;
	changed_by_name: string | null;
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

// ─── Đánh giá vòng thực hành (GĐ3): màn NHD + nhập kết quả hàng loạt ────────
/** 1 vòng kèm học viên / khóa — GET /me/mentoring và GET /courses/practice-results */
export interface PracticeResultRow {
	id: string;
	enrollment_id: string;
	round_title: string | null;
	seq: number;
	attempt_no: number;
	start_date: string | null;
	end_date: string | null;
	duration_text: string | null;
	department_id: string | null;
	department_name: string | null;
	mentor_user_id: string | null;
	mentor_name: string | null;
	result: RotationResult;
	result_comment: string | null;
	result_at: string | null;
	result_source: RotationResultSource | null;
	result_by_name: string | null;
	practice_code: string | null;
	course_id: string;
	course_name: string;
	trainee_name: string;
	trainee_phone: string | null;
	program_code: string | null;
	program_name: string | null;
}

export interface PracticeResultOption {
	/** '' = chưa phân NHD / chưa có khoa */
	id: string;
	name: string;
	count: number;
}

export interface PracticeResultList {
	rows: PracticeResultRow[];
	mentors: PracticeResultOption[];
	departments: PracticeResultOption[];
	total: number;
}

export interface PracticeResultSave {
	id: string;
	result: RotationResult;
	comment?: string | null;
}
