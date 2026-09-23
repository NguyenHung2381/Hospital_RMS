// ─── TYPES ────────────────────────────────
export type ModalType = 'add' | 'edit' | 'delete' | null;

export interface Department {
	id: string;
	name: string;
	code: string;
	abbreviation: string;
	description: string | null;
	specialty_group: string | null;
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
	specialty_group: string;
}

// Hệ chuyên môn (nhóm khoa) dùng để lập hội đồng — theo phân hệ của bệnh viện.
export const SPECIALTY_GROUPS = [
	'CLS',
	'Gây mê - Hồi sức - Chống độc',
	'Khoa lẻ',
	'Ngoại CT-Bỏng-Cột sống',
	'Ngoại tiêu hóa - gan mật - tiếu niệu',
	'Nội 1 (Nội thận - TH - CXK)',
	'Nội 2 (Nội HH - DƯ - Nội A - KKB)',
	'Phòng ban',
	'Sản nhi',
	'Thần kinh - ĐQ',
	'Tim mạch',
] as const;

export interface DeptListResponse {
	data: Department[];
	pagination: { page: number; limit: number; total: number };
}

export const EMPTY_FORM: DeptFormData = {
	name: '',
	code: '',
	abbreviation: '',
	description: '',
	specialty_group: '',
};
