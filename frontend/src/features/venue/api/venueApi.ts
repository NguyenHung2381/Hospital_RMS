import { apiClient } from '../../../shared/api/axios';
import type { Venue, VenueFormData, VenueListResponse } from '../types/venue.type';

const toPayload = (form: VenueFormData) => ({
	name: form.name.trim(),
	address: form.address.trim() || null,
	capacity: form.capacity.trim() ? Number(form.capacity) : null,
	usage_scope: form.usage_scope,
	is_active: form.is_active,
	description: form.description.trim() || null,
});

export const venueApi = {
	list: () => apiClient.get<VenueListResponse>('/venues?limit=0'),

	create: (form: VenueFormData) => apiClient.post<Venue>('/venues', toPayload(form)),

	update: (id: string, form: VenueFormData) =>
		apiClient.put<Venue>(`/venues/${id}`, toPayload(form)),

	remove: (id: string) => apiClient.delete<null>(`/venues/${id}`),
};
