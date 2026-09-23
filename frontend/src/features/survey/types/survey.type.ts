export type SurveyStatus = 'draft' | 'active' | 'closed';
export type QuestionType = 'single_choice' | 'multi_choice' | 'text';

export type ModalType = 'add' | 'edit' | 'delete' | 'results' | null;

export interface SurveyQuestion {
	id: string;
	survey_id: string;
	question_text: string;
	question_type: QuestionType;
	options: string[];
	sort_order: number;
}

export interface Survey {
	id: string;
	title: string;
	description: string | null;
	status: SurveyStatus;
	target_role: string | null;
	target_role_name: string | null;
	question_count: number;
	response_count: number;
	created_at: string;
	created_by: string;
	updated_at: string | null;
	questions?: SurveyQuestion[];
}

export interface SurveyListResponse {
	data: Survey[];
	pagination: { page: number; limit: number; total: number };
}

export interface QuestionResultCount {
	option: string;
	count: number;
}

export interface SurveyQuestionResult extends SurveyQuestion {
	counts?: QuestionResultCount[];
	texts?: string[];
}

export interface SurveyResults extends Omit<Survey, 'questions'> {
	questions: SurveyQuestionResult[];
}

export interface QuestionFormData {
	tempId: string;
	question_text: string;
	question_type: QuestionType;
	options: string[];
}

export interface SurveyFormData {
	title: string;
	description: string;
	status: SurveyStatus;
	target_role: string;
	questions: QuestionFormData[];
}

// ─── Trả lời (người dùng) ─────────────────────────────────────────────────
export interface ActiveSurvey {
	id: string;
	title: string;
	description: string | null;
	created_at: string;
}

export interface SurveyToRespond {
	id: string;
	title: string;
	description: string | null;
	status: SurveyStatus;
	target_role: string | null;
	questions: SurveyQuestion[];
}

export interface AnswerPayload {
	question_id: string;
	answer_text?: string;
	answer_options?: string[];
}
