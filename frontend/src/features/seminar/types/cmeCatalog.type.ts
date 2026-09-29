// Danh mục quy đổi CME: nhóm hoạt động (cme_credit_groups) + loại hình có
// công thức quy đổi (cme_credit_categories). Mã do admin tự đặt (DT_KHOAHOC...).

export type CmeConversionMethod = 'per_session' | 'fixed' | 'per_year';

export interface CmeCreditGroup {
	id: string;
	name: string;
	description: string | null;
	sort_order: number;
	created_at: string;
}

export interface CmeCreditCategoryItem {
	id: string;
	name: string;
	description: string | null;
	group_id: string | null;
	conversion_method: CmeConversionMethod;
	conversion_value: number | null;
	unit_label: string | null;
	created_at: string;
}

export interface CmeGroupFormData {
	id: string;
	name: string;
	sort_order: string;
	description: string;
}

export interface CmeCategoryFormData {
	id: string;
	name: string;
	group_id: string;
	conversion_method: CmeConversionMethod;
	conversion_value: string;
	unit_label: string;
	description: string;
}
