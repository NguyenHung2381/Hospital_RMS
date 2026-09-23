import { apiClient } from '../../../shared/api/axios';
import type {
	CatalogItem,
	CatalogFormData,
	CatalogListResponse,
	CatalogTab,
	LevelOption,
} from '../types/catalog.type';

export const catalogApi = {
	list: (tab: CatalogTab) =>
		apiClient.get<CatalogListResponse>(`/${tab}?limit=0`),

	/** Tất cả cấp độ (để tick trong modal "Loại đợt"). */
	allLevels: () =>
		apiClient
			.get<{ data: LevelOption[] }>('/levels?limit=0')
			.then((r) => r.data),

	/** Danh sách id cấp độ đang gán cho một loại đợt. */
	roundTypeLevels: (roundTypeId: string) =>
		apiClient.get<string[]>(`/round-types/${roundTypeId}/levels`),

	/** Ghi đè danh sách cấp độ cho một loại đợt. */
	setRoundTypeLevels: (roundTypeId: string, levelIds: string[]) =>
		apiClient.put<string[]>(`/round-types/${roundTypeId}/levels`, {
			level_ids: levelIds,
		}),

	create: (tab: CatalogTab, form: CatalogFormData) =>
		apiClient.post<CatalogItem>(`/${tab}`, {
			name: form.name,
			description: form.description || null,
		}),

	update: (tab: CatalogTab, id: string, form: CatalogFormData) =>
		apiClient.put<CatalogItem>(`/${tab}/${id}`, {
			name: form.name,
			description: form.description || null,
		}),

	remove: (tab: CatalogTab, id: string) =>
		apiClient.delete<null>(`/${tab}/${id}`),
};
