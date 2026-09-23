/** Phạm vi dùng của địa điểm — khớp CHECK constraint venues.usage_scope. */
export type VenueScope = 'defense' | 'training' | 'both';

export interface Venue {
	id: string;
	name: string;
	description: string | null;
	address: string | null;
	capacity: number | null;
	usage_scope: VenueScope;
	is_active: boolean;
	created_at: string;
}

export interface VenueFormData {
	name: string;
	address: string;
	capacity: string;
	usage_scope: VenueScope;
	is_active: boolean;
	description: string;
}

export interface VenueListResponse {
	data: Venue[];
	pagination: { page: number; limit: number; total: number };
}
