import { apiClient } from '../../../shared/api/axios';

export interface Notification {
	id: string;
	type: string;
	title: string;
	message: string | null;
	ref_id: string | null;
	ref_type: string | null;
	is_read: boolean;
	created_at: string;
}

interface NotifListResponse {
	data: Notification[];
	pagination: { page: number; limit: number; total: number };
}

export const getNotifications = (params?: {
	page?: number;
	limit?: number;
	unread_only?: boolean;
}) => {
	const entries = Object.entries(params ?? {})
		.filter(([, v]) => v !== undefined)
		.map(([k, v]) => [k, String(v)] as [string, string]);
	const qs = entries.length
		? `?${new URLSearchParams(entries).toString()}`
		: '';
	return apiClient.get<NotifListResponse>(`/notifications${qs}`);
};

export const getUnreadCount = () =>
	apiClient.get<{ count: number }>('/notifications/unread-count');

export const markNotificationRead = (id: string) =>
	apiClient.put<null>(`/notifications/${id}/read`, {});

export const markAllNotificationsRead = () =>
	apiClient.put<null>('/notifications/read-all', {});
