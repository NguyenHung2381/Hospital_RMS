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
	is_active: boolean;
	is_employee: boolean;
	created_at: string;
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
	is_active: true,
	is_employee: false,
};

export const GENDER_OPTIONS = [
	{ value: 'male', label: 'Nam' },
	{ value: 'female', label: 'Nữ' },
	{ value: 'other', label: 'Khác' },
] as const;

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
	warnings: string[];
}

export interface TraineeImportResult {
	dry_run: boolean;
	rows?: TraineeImportRow[];
	summary?: { total: number; matched_type: number; matched_department: number };
	inserted?: number;
	warnings: string[];
}
