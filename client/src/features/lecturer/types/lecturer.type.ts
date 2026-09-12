export type ModalType = 'add' | 'edit' | 'delete' | null;

export interface Lecturer {
	id: string;
	user_id: string | null;
	user_full_name: string | null;
	username: string | null;
	full_name: string;
	specialty: string | null;
	is_external: boolean;
	phone: string | null;
	email: string | null;
	is_active: boolean;
	created_at: string;
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
