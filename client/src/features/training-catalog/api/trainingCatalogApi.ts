import { apiClient } from '../../../shared/api/axios';
import type {
	TrainingCatalogFormData,
	TrainingCatalogItem,
	TrainingCatalogListResponse,
	TrainingCatalogTab,
} from '../types/trainingCatalog.type';

export const trainingCatalogApi = {
	list: (tab: TrainingCatalogTab) =>
		apiClient.get<TrainingCatalogListResponse>(`/${tab}?limit=0`),

	create: (tab: TrainingCatalogTab, form: TrainingCatalogFormData) =>
		apiClient.post<TrainingCatalogItem>(`/${tab}`, {
			name: form.name,
			description: form.description || null,
		}),

	update: (tab: TrainingCatalogTab, id: string, form: TrainingCatalogFormData) =>
		apiClient.put<TrainingCatalogItem>(`/${tab}/${id}`, {
			name: form.name,
			description: form.description || null,
		}),

	remove: (tab: TrainingCatalogTab, id: string) =>
		apiClient.delete<null>(`/${tab}/${id}`),
};
