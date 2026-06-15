import { apiClient } from '../../../lib/apiClient';

export interface StatusCounts {
	draft: number;
	submitted: number;
	approved: number;
	rejected: number;
	supplement: number;
	completed: number;
}

export interface DeptStat {
	name: string;
	total: number;
	categories: { name: string; count: number }[];
}

export interface NameCount {
	name: string;
	count: number;
}

export interface RecentApproval {
	id: string;
	topic_id: string;
	topic_title: string;
	status: string;
	comment: string | null;
	created_at: string;
	approver_name: string | null;
}

export interface DashboardStats {
	overview: { total: number; by_status: StatusCounts };
	by_department: DeptStat[];
	by_category: NameCount[];
	by_level: NameCount[];
	trend_by_category: {
		rows: Record<string, string | number>[];
		categories: string[];
	};
	recent_approvals: RecentApproval[];
}

export const getDashboardStats = () =>
	apiClient.get<DashboardStats>('/dashboard/stats');
