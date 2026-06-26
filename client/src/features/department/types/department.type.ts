// ─── TYPES ────────────────────────────────
export type ModalType = 'add' | 'edit' | 'delete' | null;

export interface Department {
	id: string;
	name: string;
	code: string;
	abbreviation: string;
	description: string | null;
	dept_account_id: string | null;
	created_at: string;
	topic_count?: number;
	user_count?: number;
}

export interface DeptFormData {
	name: string;
	code: string;
	abbreviation: string;
	description: string;
}

export interface DeptListResponse {
	data: Department[];
	pagination: { page: number; limit: number; total: number };
}

export const EMPTY_FORM: DeptFormData = {
	name: '',
	code: '',
	abbreviation: '',
	description: '',
};
