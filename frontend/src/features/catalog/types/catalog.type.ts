/** Nhóm trang danh mục: NCKH (/admin/categories…) và Đào tạo (/admin/trainee-types…). */
export type CatalogGroup = 'research' | 'training';

export type CatalogTab =
	| 'categories'
	| 'levels'
	| 'round-types'
	| 'trainee-types'
	| 'training-forms'
	| 'training-types'
	| 'hospital-training-topics';

export type ModalType = 'add' | 'edit' | 'delete' | null;

export interface CatalogItem {
	id: string;
	name: string;
	description: string | null;
	created_at: string;
}

export interface CatalogFormData {
	name: string;
	description: string;
	/** Chỉ dùng cho tab "Loại đợt": danh sách cấp độ được phép. */
	level_ids?: string[];
}

export interface LevelOption {
	id: string;
	name: string;
}

export interface CatalogListResponse {
	data: CatalogItem[];
	pagination: { page: number; limit: number; total: number };
}
