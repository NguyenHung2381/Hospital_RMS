import { apiClient } from '../../../shared/api/axios';
import type {
	CatalogItem,
	CatalogFormData,
	CatalogListResponse,
	CatalogTab,
	LevelOption,
} from '../types/catalog.type';
import { seg } from '../../../shared/api/path';

// Tab "Loại hình đào tạo": kiểu chấm công + mẫu ca tuần mặc định + phương thức điểm danh (chỉ gửi khi form có)
const attendanceFields = (form: CatalogFormData) => ({
	...(form.attendance_mode !== undefined ? { attendance_mode: form.attendance_mode } : {}),
	...(form.shift_pattern_id !== undefined ? { shift_pattern_id: form.shift_pattern_id } : {}),
	...(form.attendance_methods !== undefined ? { attendance_methods: form.attendance_methods } : {}),
});

export const catalogApi = {
	list: (tab: CatalogTab) =>
		apiClient.get<CatalogListResponse>(`/${seg(tab)}?limit=0`),

	/** Tất cả cấp độ (để tick trong modal "Loại đợt"). */
	allLevels: () =>
		apiClient
			.get<{ data: LevelOption[] }>('/levels?limit=0')
			.then((r) => r.data),

	/** Danh sách id cấp độ đang gán cho một loại đợt. */
	roundTypeLevels: (roundTypeId: string) =>
		apiClient.get<string[]>(`/round-types/${seg(roundTypeId)}/levels`),

	/** Ghi đè danh sách cấp độ cho một loại đợt. */
	setRoundTypeLevels: (roundTypeId: string, levelIds: string[]) =>
		apiClient.put<string[]>(`/round-types/${seg(roundTypeId)}/levels`, {
			level_ids: levelIds,
		}),

	create: (tab: CatalogTab, form: CatalogFormData) =>
		apiClient.post<CatalogItem>(`/${seg(tab)}`, {
			name: form.name,
			description: form.description || null,
			...attendanceFields(form),
		}),

	update: (tab: CatalogTab, id: string, form: CatalogFormData) =>
		apiClient.put<CatalogItem>(`/${seg(tab)}/${seg(id)}`, {
			name: form.name,
			description: form.description || null,
			...attendanceFields(form),
		}),

	remove: (tab: CatalogTab, id: string) =>
		apiClient.delete<null>(`/${seg(tab)}/${seg(id)}`),
};
