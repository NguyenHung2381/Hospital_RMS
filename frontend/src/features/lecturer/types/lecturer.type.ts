export type ModalType = 'add' | 'edit' | 'delete' | null;

export interface Lecturer {
	id: string;
	user_id: string | null;
	user_full_name: string | null;
	username: string | null;
	staff_number: number | null;
	full_name: string;
	specialty: string | null;
	is_external: boolean;
	phone: string | null;
	email: string | null;
	is_active: boolean;
	created_at: string;
	// Hồ sơ CCHN của tài khoản liên kết (chỉ đọc)
	license_no: string | null;
	license_issued_date: string | null;
	license_issuing_authority: string | null;
	license_practice_scope: string | null;
}

export interface LecturerFromStaffResult {
	created: Lecturer[];
	skipped: { user_id: string; full_name: string | null; reason: string }[];
}

export interface LecturerFormData {
	full_name: string;
	specialty: string;
	is_external: boolean;
	phone: string;
	email: string;
}

export interface LecturerListResponse {
	data: Lecturer[];
	pagination: { page: number; limit: number; total: number };
}

export const EMPTY_FORM: LecturerFormData = {
	full_name: '',
	specialty: '',
	is_external: false,
	phone: '',
	email: '',
};
