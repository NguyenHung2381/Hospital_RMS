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
