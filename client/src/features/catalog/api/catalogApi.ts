import { apiClient } from '../../../lib/apiClient';
import type {
	CatalogItem,
	CatalogFormData,
	CatalogListResponse,
	CatalogTab,
} from '../types/catalog.type';

export const catalogApi = {
	list: (tab: CatalogTab) =>
		apiClient.get<CatalogListResponse>(`/${tab}?limit=500`),

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
