import { apiClient } from '../../../shared/api/axios';

export interface MyTaskApproval {
	id: string;
	title: string;
	status: string;
	department_name: string | null;
	round_name: string | null;
	created_at: string;
}

export interface MyTaskProgressReview {
	id: string;
	title: string;
	my_role: string;
	council_id: string;
	council_name: string;
	defense_date: string | null;
	department_name: string | null;
}

export interface MyTasks {
	approvals: MyTaskApproval[];
	progress_reviews: MyTaskProgressReview[];
	total: number;
}

export const getMyTasks = () => apiClient.get<MyTasks>('/my-tasks');
