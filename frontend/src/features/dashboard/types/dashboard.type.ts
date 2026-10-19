// Kiểu dữ liệu GET /dashboard/stats (Dashboard NCKH; trang Báo cáo đọc thêm overview theo năm).
export interface StatusCounts {
	submitted: number;
	approved: number;
	rejected: number;
	supplement: number;
	cancelled: number;
}

export interface DeptStat {
	name: string;
	specialty_group: string;
	total: number;
	de_tai: number;
	bai_bao: number;
	approved: number;
	approval_rate: number;
	by_status: StatusCounts;
	categories: NameCount[];
	council_progress: { expected: number; completed: number };
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

export type ProgressRating = 'on_track' | 'behind' | 'at_risk';

export interface CouncilProgressStat {
	expected: number;
	completed: number;
	by_rating: { rating: ProgressRating; count: number }[];
}

export interface ResearchSummary {
	topics_this_year: number;
	rounds_active: number;
	councils_total: number;
	councils_upcoming: number;
}

export interface DashboardStats {
	overview: { total: number; by_status: StatusCounts };
	summary?: ResearchSummary;
	by_department: DeptStat[];
	by_article_type: ArticleTypeCount[];
	by_category: NameCount[];
	by_level: NameCount[];
	trend_by_category: {
		rows: Record<string, string | number>[];
		categories: string[];
	};
	recent_approvals: RecentApproval[];
	council_progress: CouncilProgressStat;
}
