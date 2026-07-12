export interface StatusCounts {
	submitted: number;
	approved: number;
	rejected: number;
	supplement: number;
	cancelled: number;
}

export interface DeptStat {
	name: string;
	total: number;
	de_tai: number;
	bai_bao: number;
	approved: number;
	approval_rate: number;
	by_status: StatusCounts;
}

export interface ArticleTypeCount {
	type: 'de_tai' | 'bai_bao';
	count: number;
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
	by_article_type: ArticleTypeCount[];
	by_category: NameCount[];
	by_level: NameCount[];
	trend_by_category: {
		rows: Record<string, string | number>[];
		categories: string[];
	};
	recent_approvals: RecentApproval[];
}
