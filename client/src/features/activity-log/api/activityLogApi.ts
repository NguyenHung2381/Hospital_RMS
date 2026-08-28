import { apiClient } from '../../../shared/api/axios';

export interface ActivityLog {
	// id giờ là timestamp nano-giây từ Loki (chuỗi số dài), chỉ dùng làm React key.
	id: string | number;
	actor_id: string | null;
	actor_username: string | null;
	method: string;
	path: string;
	status_code: number | null;
	ip_address: string | null;
	created_at: string;
}

export interface ActivityLogListResponse {
	data: ActivityLog[];
	next_cursor: string | null;
}

function toQS(params: object): string {
	const entries = Object.entries(params)
		.filter(([, v]) => v !== undefined && v !== '')
		.map(([k, v]) => [k, String(v)] as [string, string]);
	return entries.length ? `?${new URLSearchParams(entries)}` : '';
}

export const getActivityLogs = (params?: {
	limit?: number;
	cursor?: string;
	actor_id?: string;
	method?: string;
	search?: string;
}) => apiClient.get<ActivityLogListResponse>(`/activity-logs${toQS(params ?? {})}`);
