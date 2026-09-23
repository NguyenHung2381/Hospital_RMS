export type TrainingPlanStatus = 'draft' | 'active' | 'completed' | 'cancelled';

export type ModalType = 'add' | 'edit' | 'delete' | null;

export interface TrainingPlanItem {
	id: string;
	plan_id: string;
	title: string;
	quarter: number | null;
	target_count: number | null;
	note: string | null;
	created_at: string;
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
	items?: TrainingPlanItem[];
}

export interface TrainingPlanListResponse {
	data: TrainingPlan[];
	pagination: { page: number; limit: number; total: number };
}

export interface TrainingPlanItemFormData {
	tempId: string;
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
