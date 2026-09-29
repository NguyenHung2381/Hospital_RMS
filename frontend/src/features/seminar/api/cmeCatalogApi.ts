import { apiClient } from '../../../shared/api/axios';
import type {
	CmeCategoryFormData,
	CmeCreditCategoryItem,
	CmeCreditGroup,
	CmeGroupFormData,
} from '../types/cmeCatalog.type';

type ListResponse<T> = { data: T[] };

const groupPayload = (f: CmeGroupFormData) => ({
	name: f.name.trim(),
	sort_order: f.sort_order.trim() ? Number(f.sort_order) : 0,
	description: f.description.trim() || null,
});

const categoryPayload = (f: CmeCategoryFormData) => ({
	name: f.name.trim(),
	group_id: f.group_id || null,
	conversion_method: f.conversion_method,
	conversion_value: f.conversion_value.trim() ? Number(f.conversion_value) : null,
	unit_label: f.unit_label.trim() || null,
	description: f.description.trim() || null,
});

// Mã chỉ gửi khi tạo mới — sửa không đổi được khoá chính.
const withCode = <T extends object>(code: string, payload: T) =>
	code.trim() ? { id: code.trim().toUpperCase(), ...payload } : payload;

export const cmeCatalogApi = {
	listGroups: () => apiClient.get<ListResponse<CmeCreditGroup>>('/cme-credit-groups?limit=0'),
	createGroup: (f: CmeGroupFormData) =>
		apiClient.post<CmeCreditGroup>('/cme-credit-groups', withCode(f.id, groupPayload(f))),
	updateGroup: (id: string, f: CmeGroupFormData) =>
		apiClient.put<CmeCreditGroup>(`/cme-credit-groups/${id}`, groupPayload(f)),
	removeGroup: (id: string) => apiClient.delete<null>(`/cme-credit-groups/${id}`),

	listCategories: () =>
		apiClient.get<ListResponse<CmeCreditCategoryItem>>('/cme-credit-categories?limit=0'),
	createCategory: (f: CmeCategoryFormData) =>
		apiClient.post<CmeCreditCategoryItem>(
			'/cme-credit-categories',
			withCode(f.id, categoryPayload(f)),
		),
	updateCategory: (id: string, f: CmeCategoryFormData) =>
		apiClient.put<CmeCreditCategoryItem>(`/cme-credit-categories/${id}`, categoryPayload(f)),
	removeCategory: (id: string) => apiClient.delete<null>(`/cme-credit-categories/${id}`),
};
