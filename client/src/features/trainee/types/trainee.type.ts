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
	trainee_type_id: string | null;
	trainee_type_name: string | null;
	department_id: string | null;
	department_name: string | null;
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
	trainee_type_id: string;
	department_id: string;
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
	trainee_type_id: '',
	department_id: '',
};

export const GENDER_OPTIONS = [
	{ value: 'male', label: 'Nam' },
	{ value: 'female', label: 'Nữ' },
	{ value: 'other', label: 'Khác' },
] as const;
