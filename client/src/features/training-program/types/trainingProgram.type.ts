export type ModalType = 'add' | 'edit' | 'delete' | null;

export interface TrainingProgram {
	id: string;
	name: string;
	department_id: string | null;
	department_name: string | null;
	trainee_type_id: string | null;
	trainee_type_name: string | null;
	training_type_id: string | null;
	training_type_name: string | null;
	description: string | null;
	subject_ids?: string[];
	created_at: string;
}

export interface TrainingProgramFormData {
	name: string;
	department_id: string;
	trainee_type_id: string;
	training_type_id: string;
	description: string;
	subject_ids: string[];
}

export interface TrainingProgramListResponse {
	data: TrainingProgram[];
	pagination: { page: number; limit: number; total: number };
}

export const EMPTY_FORM: TrainingProgramFormData = {
	name: '',
	department_id: '',
	trainee_type_id: '',
	training_type_id: '',
	description: '',
	subject_ids: [],
};
