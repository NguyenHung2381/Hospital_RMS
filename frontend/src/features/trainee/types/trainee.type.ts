export type ModalType = 'add' | 'edit' | 'delete' | null;

export interface Trainee {
	id: string;
	full_name: string;
	dob: string | null;
	gender: string | null;
	national_id: string | null;
	phone: string | null;
	email: string | null;
	address: string | null;
	permanent_address: string | null;
	trainee_type_id: string | null;
	trainee_type_name: string | null;
	department_id: string | null;
	department_name: string | null;
	national_id_issued_date: string | null;
	national_id_issued_place: string | null;
	graduated_school: string | null;
	graduated_year: number | null;
	workplace: string | null;
	position: string | null;
	qualification: string | null;
	notes: string | null;
	/** Nơi sinh (tỉnh) — in trên hợp đồng thực hành. */
	birth_province: string | null;
	graduated_date: string | null;
	degree_issued_date: string | null;
	/** Mã học viên trong sổ thực hành cũ. */
	legacy_code: string | null;
	is_active: boolean;
	is_employee: boolean;
	created_at: string;
	/** D0 — tài khoản đăng nhập cho học viên (điểm danh QR, thi online). */
	user_id: string | null;
	account_granted: boolean;
	// Có khi lọc theo loại khóa: lượt ghi danh gần nhất thuộc loại đó.
	practice_code?: string | null;
	program_name?: string | null;
	course_name?: string | null;
	enrollment_start_date?: string | null;
	enrollment_end_date?: string | null;
	current_department?: string | null;
	type_enrollment_count?: number;
}

export interface TraineeFormData {
	full_name: string;
	dob: string;
	gender: string;
	national_id: string;
	phone: string;
	email: string;
	address: string;
	permanent_address: string;
	trainee_type_id: string;
	department_id: string;
	national_id_issued_date: string;
	national_id_issued_place: string;
	graduated_school: string;
	graduated_year: string;
	workplace: string;
	position: string;
	qualification: string;
	notes: string;
	birth_province: string;
	graduated_date: string;
	degree_issued_date: string;
	legacy_code: string;
	is_active: boolean;
	is_employee: boolean;
}

export type EnrollmentStatus = 'pending' | 'approved' | 'rejected' | 'waitlisted';

export interface TraineeEnrollment {
	id: string;
	course_id: string;
	course_name: string;
	start_date: string | null;
	end_date: string | null;
	status: EnrollmentStatus;
	registered_at: string;
	decided_at: string | null;
	program_names: string | null;
	/** Chương trình học viên đã chọn khi ghi danh. */
	program_id: string | null;
	program_code: string | null;
	program_name: string | null;
	training_type_name: string | null;
	practice_code: string | null;
	progress_status: 'in_progress' | 'completed' | 'dropped';
	practice_start_date: string | null;
	practice_end_date: string | null;
}

export interface TraineeListResponse {
	data: Trainee[];
	pagination: { page: number; limit: number; total: number };
	/** Số học viên theo loại khóa đã ghi danh (key '' = tất cả). */
	type_counts?: Record<string, number>;
}

export const EMPTY_FORM: TraineeFormData = {
	full_name: '',
	dob: '',
	gender: '',
	national_id: '',
	phone: '',
	email: '',
	address: '',
	permanent_address: '',
	trainee_type_id: '',
	department_id: '',
	national_id_issued_date: '',
	national_id_issued_place: '',
	graduated_school: '',
	graduated_year: '',
	workplace: '',
	position: '',
	qualification: '',
	notes: '',
	birth_province: '',
	graduated_date: '',
	degree_issued_date: '',
	legacy_code: '',
	is_active: true,
	is_employee: false,
};

export { GENDER_OPTIONS } from '../../../shared/utils/gender';

export interface TraineeImportRow {
	row: number;
	full_name: string;
	dob: string | null;
	dob_text: string | null;
	gender: string | null;
	national_id: string | null;
	phone: string | null;
	email: string | null;
	address: string | null;
	permanent_address: string | null;
	trainee_type_id: string | null;
	trainee_type_raw: string | null;
	department_id: string | null;
	department_raw: string | null;
	qualification: string | null;
	graduated_school: string | null;
	graduated_year: number | null;
	is_employee: boolean;
	notes: string | null;
	/** new: thêm mới · update: CCCD đã có, cập nhật · duplicate: CCCD lặp lại trong file. */
	action: 'new' | 'update' | 'duplicate';
	warnings: string[];
}

export interface TraineeImportResult {
	dry_run: boolean;
	rows?: TraineeImportRow[];
	summary?: { total: number; new: number; update: number; matched_type: number; matched_department: number };
	inserted?: number;
	updated?: number;
	warnings: string[];
}

// ─── Tiến độ thực tế so với chương trình hiện tại (GET /trainees/:id/progress) ───
/** missing: chương trình mới thêm, hồ sơ học viên chưa có. */
export type TheoryProgressStatus = 'done' | 'in_progress' | 'not_started' | 'missing';
export type RotationProgressStatus =
	| 'passed'
	| 'in_progress'
	| 'scheduled'
	| 'not_scheduled'
	| 'overdue'
	| 'failed'
	| 'missing';
export type ProgressPace =
	| 'completed'
	| 'dropped'
	| 'not_started'
	| 'ahead'
	| 'on_track'
	| 'behind'
	| 'overdue'
	| 'unknown';

export interface TheoryProgressItem {
	lesson_id: string;
	code: string | null;
	title: string;
	hours: number | null;
	/** false: chương trình đã bỏ bài này, hồ sơ còn giữ (không tính vào %). */
	in_program: boolean;
	status: TheoryProgressStatus;
	completed_at: string | null;
}

export interface RotationProgressSegment {
	id: string;
	department_name: string | null;
	start_date: string | null;
	end_date: string | null;
	duration_text: string | null;
	mentor_name: string | null;
	result: 'pending' | 'pass' | 'fail';
	attempt_no: number;
}

export interface RotationProgressItem {
	lesson_id: string | null;
	code: string | null;
	title: string;
	required_duration: string | null;
	required_days: number | null;
	in_program: boolean;
	status: RotationProgressStatus;
	segments: RotationProgressSegment[];
}

export interface TraineeProgress {
	enrollment_id: string;
	course_id: string;
	course_name: string;
	program_id: string | null;
	program_code: string | null;
	program_name: string | null;
	program_duration: string | null;
	program_theory_hours: number | null;
	program_practice_hours: number | null;
	progress_status: 'in_progress' | 'completed' | 'dropped';
	progress_date: string | null;
	theory: {
		items: TheoryProgressItem[];
		summary: {
			required: number;
			done: number;
			in_progress: number;
			not_started: number;
			missing: number;
			extra: number;
			hours_required: number;
			hours_done: number;
		};
	};
	rotations: {
		items: RotationProgressItem[];
		summary: {
			required: number;
			passed: number;
			in_progress: number;
			scheduled: number;
			not_scheduled: number;
			overdue: number;
			failed: number;
			missing: number;
			extra: number;
			days_required: number;
			days_passed: number;
		};
	};
	summary: {
		required: number;
		done: number;
		/** 0..1, null khi chương trình chưa có bài / vòng nào. */
		completion: number | null;
		start_date: string | null;
		end_date: string | null;
		/** Phần thời gian đã trôi qua 0..1. */
		elapsed: number | null;
		pace: ProgressPace;
		/** Hồ sơ lệch chương trình hiện tại (bài/vòng mới thêm hoặc đã bỏ). */
		out_of_sync: boolean;
	};
}
