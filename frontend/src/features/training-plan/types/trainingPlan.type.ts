export type TrainingPlanStatus = 'draft' | 'active' | 'completed' | 'cancelled';

export type ModalType = 'add' | 'edit' | 'delete' | null;

/** Khóa học đã mở theo 1 hạng mục kế hoạch (courses.plan_item_id). */
export interface PlanItemCourse {
	id: string;
	name: string;
	start_date: string | null;
	end_date: string | null;
	status: string;
	approved_count: number;
}

export interface TrainingPlanItem {
	id: string;
	plan_id: string;
	title: string;
	quarter: number | null;
	target_count: number | null;
	note: string | null;
	created_at: string;
	courses?: PlanItemCourse[];
	/** Học viên đã duyệt ở các khóa (chưa huỷ) của hạng mục — so với target_count. */
	trainee_count?: number;
}

export interface TrainingPlan {
	id: string;
	department_id: string | null;
	department_name: string | null;
	year: number;
	title: string;
	description: string | null;
	status: TrainingPlanStatus;
	created_at: string;
	created_by: string;
	updated_at: string | null;
	item_count: number;
	/** Số hạng mục đã có ít nhất 1 khóa học. */
	done_item_count: number;
	items?: TrainingPlanItem[];
}

export interface TrainingPlanListResponse {
	data: TrainingPlan[];
	pagination: { page: number; limit: number; total: number };
}

export interface TrainingPlanItemFormData {
	tempId: string;
	/** Hạng mục đã lưu — gửi kèm để server cập nhật tại chỗ, giữ liên kết khóa học. */
	id?: string;
	title: string;
	quarter: string;
	target_count: string;
	note: string;
}

export interface TrainingPlanFormData {
	department_id: string;
	year: string;
	title: string;
	description: string;
	status: TrainingPlanStatus;
	items: TrainingPlanItemFormData[];
}
