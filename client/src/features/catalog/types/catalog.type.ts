export type CatalogTab = 'categories' | 'levels' | 'round-types';
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
}

export interface CatalogListResponse {
	data: CatalogItem[];
	pagination: { page: number; limit: number; total: number };
}
