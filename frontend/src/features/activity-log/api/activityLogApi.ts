import { apiClient } from '../../../shared/api/axios';

export type ActivityAction =
	| 'view'
	| 'create'
	| 'update'
	| 'delete'
	| 'execute'
	| 'login'
	| 'login_failed'
	| 'logout'
	| 'auth';

export interface ActivityLog {
	// id = trường ts (epoch ms có phần thập phân), chỉ dùng làm React key.
	id: string;
	actor_id: string | null;
	actor_username: string | null;
	actor_name: string | null;
	role_id: string | number | null;
	method: string;
	path: string;
	route: string | null;
	params: Record<string, string> | null;
	status_code: number | null;
	aborted: boolean;
	duration_ms: number | null;
	response_bytes: number | null;
	ip_address: string | null;
	ip_kind: 'public' | 'private' | 'loopback' | 'unknown';
	forwarded_for: string | null;
	user_agent: string | null;
	referer: string | null;
	/** JSON (đã che trường nhạy cảm) của dữ liệu người dùng gửi lên. */
	body: string | null;
	files: { name: string; size: number; type: string }[] | null;
	error: string | null;
	result_id: string | null;
	created_at: string;
	module: string;
	module_label: string;
	action: ActivityAction;
	action_label: string;
	target_id: string | null;
	summary: string;
}

export interface ActivityLogListResponse {
	data: ActivityLog[];
	total: number;
	page: number;
	limit: number;
	total_pages: number;
	/** true = chạm giới hạn quét, tổng có thể thiếu — nên thu hẹp thời gian */
	truncated: boolean;
}

export interface ActivitySession {
	id: string;
	actor_id: string | null;
	actor_username: string | null;
	actor_name: string | null;
	started_at: string;
	ended_at: string;
	duration_ms: number;
	request_count: number;
	write_count: number;
	error_count: number;
	login: boolean;
	logout: boolean;
	total_duration_ms: number;
	ips: string[];
	user_agents: string[];
	top_modules: { label: string; count: number }[];
}

export interface EndpointStat {
	endpoint: string;
	summary: string;
	count: number;
	errors: number;
	avg_ms: number | null;
	p95_ms: number | null;
	max_ms: number | null;
}

export interface ActivityStats {
	range: { from: string | null; to: string | null };
	truncated: boolean;
	totals: {
		requests: number;
		users: number;
		ips: number;
		writes: number;
		errors: number;
		server_errors: number;
		logins: number;
		failed_logins: number;
		avg_ms: number | null;
		p95_ms: number | null;
	};
	by_action: Partial<Record<ActivityAction, number>>;
	by_hour: number[];
	top_modules: { module: string; label: string; count: number; writes: number }[];
	top_users: {
		actor_id: string | null;
		actor_username: string | null;
		actor_name: string | null;
		count: number;
		writes: number;
		errors: number;
		last_at: string;
	}[];
	slowest_endpoints: EndpointStat[];
	error_endpoints: EndpointStat[];
	sessions: ActivitySession[];
	session_gap_minutes: number;
	module_options: Record<string, string>;
}

export interface ActivityLogFilters {
	from?: string;
	to?: string;
	actor?: string;
	actor_id?: string;
	method?: string;
	action?: string;
	module?: string;
	status?: string;
	actor_type?: string;
	ip?: string;
	search?: string;
	min_duration?: number;
	exclude_views?: string;
}

function toQS(params: object): string {
	const entries = Object.entries(params)
		.filter(([, v]) => v !== undefined && v !== '' && v !== null)
		.map(([k, v]) => [k, String(v)] as [string, string]);
	return entries.length ? `?${new URLSearchParams(entries)}` : '';
}

export const getActivityLogs = (
	params: ActivityLogFilters & { page?: number; limit?: number },
) => apiClient.get<ActivityLogListResponse>(`/activity-logs${toQS(params)}`);

export const getActivityStats = (params: ActivityLogFilters) =>
	apiClient.get<ActivityStats>(`/activity-logs/stats${toQS(params)}`);
