export interface WorkflowStep {
	id: string;
	definition_id: string;
	step_order: number;
	name: string;
	approver_role_id: string | null;
	sla_days: number | null;
}

export interface WorkflowDefinition {
	id: string;
	resource: string;
	name: string;
	is_active: boolean;
	step_count: number;
	created_at: string;
	steps?: WorkflowStep[];
}

export type ModalType = 'add' | 'edit' | 'delete' | null;

export interface StepFormData {
	tempId: string;
	name: string;
	approver_role_id: string;
	sla_days: string;
}

export interface WorkflowFormData {
	resource: string;
	name: string;
	is_active: boolean;
	steps: StepFormData[];
}
