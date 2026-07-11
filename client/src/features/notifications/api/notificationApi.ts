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

export interface AdminNotification extends Notification {
	user_id: string;
	full_name: string;
}

export interface NotifListResponse {
	data: Notification[];
	pagination: { page: number; limit: number; total: number };
}

export interface AdminNotifListResponse {
	data: AdminNotification[];
	pagination: { page: number; limit: number; total: number };
}

export interface SendNotificationPayload {
	type: string;
	title: string;
	message?: string;
	ref_id?: string;
	ref_type?: string;
	target_type: 'all' | 'department' | 'users';
	target_ids?: string[];
}

function toQS(params: object): string {
	const entries = Object.entries(params)
		.filter(([, v]) => v !== undefined && v !== '')
		.map(([k, v]) => [k, String(v)] as [string, string]);
	return entries.length ? `?${new URLSearchParams(entries)}` : '';
}

export const getNotifications = (params?: {
	page?: number;
	limit?: number;
	unread_only?: boolean;
}) => {
	return apiClient.get<NotifListResponse>(`/notifications${toQS(params ?? {})}`);
};

export const getUnreadCount = () =>
	apiClient.get<{ count: number }>('/notifications/unread-count');

export const markNotificationRead = (id: string) =>
	apiClient.put<null>(`/notifications/${id}/read`, {});

export const markAllNotificationsRead = () =>
	apiClient.put<null>('/notifications/read-all', {});

export const sendNotification = (payload: SendNotificationPayload) =>
	apiClient.post<{ sent: number }>('/notifications/send', payload);

export const adminGetNotifications = (params?: {
	page?: number;
	limit?: number;
	type?: string;
	search?: string;
}) => {
	return apiClient.get<AdminNotifListResponse>(`/notifications/admin${toQS(params ?? {})}`);
};

export const deleteNotification = (id: string) =>
	apiClient.delete<null>(`/notifications/${id}`);
