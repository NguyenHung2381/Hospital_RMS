/** Nhóm trang danh mục: NCKH (/admin/categories…) và Đào tạo (/admin/trainee-types…). */
export type CatalogGroup = 'research' | 'training';

export type CatalogTab =
	| 'categories'
	| 'levels'
	| 'round-types'
	| 'trainee-types'
	| 'training-forms'
	| 'training-types'
	| 'hospital-training-topics'
	| 'professional-fields'
	| 'practice-forms'
	| 'sending-units'
	| 'trainee-document-types';

export type ModalType = 'add' | 'edit' | 'delete' | null;

export interface CatalogItem {
	id: string;
	name: string;
	description: string | null;
	created_at: string;
	/** Tab "Loại giấy tờ": loại khóa (training_types.id) bắt buộc nộp, cách nhau dấu phẩy */
	required_for_types?: string | null;
	display_order?: number;
}

export interface CatalogFormData {
	name: string;
	description: string;
	/** Chỉ dùng cho tab "Loại đợt": danh sách cấp độ được phép. */
	level_ids?: string[];
	/** Chỉ tab "Loại giấy tờ": mã tự đặt (lúc thêm), loại khóa bắt buộc, thứ tự. */
	id?: string;
	required_for_types?: string | null;
	display_order?: number;
}

export interface LevelOption {
	id: string;
	name: string;
}

export interface CatalogListResponse {
	data: CatalogItem[];
	pagination: { page: number; limit: number; total: number };
}
