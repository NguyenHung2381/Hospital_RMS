export type TrainingCatalogTab =
	| 'trainee-types'
	| 'training-forms'
	| 'training-types'
	| 'subjects';

export type ModalType = 'add' | 'edit' | 'delete' | null;

export interface TrainingCatalogItem {
	id: string;
	name: string;
	description: string | null;
	created_at: string;
}

export interface TrainingCatalogFormData {
	name: string;
	description: string;
}

export interface TrainingCatalogListResponse {
	data: TrainingCatalogItem[];
	pagination: { page: number; limit: number; total: number };
}
