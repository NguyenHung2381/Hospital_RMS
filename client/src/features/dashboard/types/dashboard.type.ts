export interface DashboardStats {
	overview: {
		total: number;
		by_status: {
			draft: number;
			submitted: number;
			approved: number;
			rejected: number;
			supplement: number;
			completed: number;
		};
	};
	by_department: {
		name: string;
		total: number;
		categories: { name: string; count: number }[];
	}[];
	by_category: { name: string; count: number }[];
	by_level: { name: string; count: number }[];
	trend_by_category: {
		rows: Record<string, string | number>[];
		categories: string[];
	};
	recent_approvals: {
		id: string;
		topic_id: string;
		topic_title: string;
		status: string;
		comment: string | null;
		created_at: string;
		approver_name: string | null;
	}[];
}
