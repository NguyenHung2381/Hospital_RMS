import { apiClient } from '../../../shared/api/axios';
import type {
	AttemptQuestion,
	AvailablePaper,
	ExamAttemptDetail,
	ExamAttemptSummary,
	ExamPaper,
	ExamQuestion,
	PaperType,
	QuestionType,
	StartAttemptResult,
	ExamPart,
	CodeMode,
	QuestionPool,
} from '../types/exam.type';

export interface QuestionPayload {
	subject_id?: string | null;
	program_id?: string | null;
	pool?: QuestionPool;
	question_type: QuestionType;
	question_text: string;
	options?: string[];
	correct_option?: string | null;
	points?: number;
	image_url?: string | null;
}

export interface PaperPayload {
	course_id?: string;
	subject_id?: string | null;
	title: string;
	/** null = hỗn hợp TN + TL (đề đầu vào) */
	paper_type?: PaperType | null;
	purpose?: QuestionPool;
	program_id?: string | null;
	gen_mc_count?: number | null;
	gen_essay_count?: number | null;
	code_mode?: CodeMode | null;
	code_count?: number | null;
	weight?: number | null;
	/** Bốc lại câu (đề chung / nhiều mã) — chỉ khi chưa ai làm bài */
	regenerate?: boolean;
	duration_minutes?: number;
	status?: string;
	question_ids?: string[];
	exam_part?: ExamPart;
	blind_grading?: boolean;
	/** Người chấm (GV); rỗng = GV được phân công bài học của đề */
	grader_ids?: string[];
}

export interface AnswerPayload {
	question_id: string;
	selected_option?: string | null;
	essay_text?: string | null;
}

export const examApi = {
	// Ngân hàng câu hỏi
	listQuestions: (
		params: { program_id?: string; pool?: QuestionPool; search?: string; question_type?: QuestionType } = {},
	) => {
		const qs = new URLSearchParams();
		if (params.program_id) qs.set('program_id', params.program_id);
		if (params.pool) qs.set('pool', params.pool);
		if (params.search) qs.set('search', params.search);
		if (params.question_type) qs.set('question_type', params.question_type);
		const q = qs.toString();
		return apiClient.get<ExamQuestion[]>(`/exams/questions${q ? `?${q}` : ''}`);
	},
	createQuestion: (payload: QuestionPayload) => apiClient.post<ExamQuestion>('/exams/questions', payload),
	createQuestionsBulk: (questions: QuestionPayload[]) =>
		apiClient.post<{ created: number }>('/exams/questions/bulk', { questions }),
	uploadQuestionImage: (file: File) => {
		const form = new FormData();
		form.append('image', file);
		return apiClient.postForm<{ url: string }>('/exams/questions/image', form);
	},
	updateQuestion: (id: string, payload: Partial<QuestionPayload>) =>
		apiClient.put<ExamQuestion>(`/exams/questions/${id}`, payload),
	removeQuestion: (id: string) => apiClient.delete<null>(`/exams/questions/${id}`),

	// Đề thi
	listPapers: (courseId: string) => apiClient.get<ExamPaper[]>(`/exams/papers?course_id=${courseId}`),
	getPaper: (id: string) => apiClient.get<ExamPaper>(`/exams/papers/${id}`),
	createPaper: (payload: PaperPayload) => apiClient.post<ExamPaper>('/exams/papers', payload),
	updatePaper: (id: string, payload: Partial<PaperPayload>) =>
		apiClient.put<ExamPaper>(`/exams/papers/${id}`, payload),
	removePaper: (id: string) => apiClient.delete<null>(`/exams/papers/${id}`),

	// Chấm bài
	listAttempts: (paperId: string) => apiClient.get<ExamAttemptSummary[]>(`/exams/papers/${paperId}/attempts`),
	getAttempt: (attemptId: string) => apiClient.get<ExamAttemptDetail>(`/exams/attempts/${attemptId}`),
	gradeAnswer: (attemptId: string, questionId: string, score: number) =>
		apiClient.post<ExamAttemptDetail>(`/exams/attempts/${attemptId}/grade`, { question_id: questionId, score }),

	// Học viên
	listAvailable: () => apiClient.get<AvailablePaper[]>('/exams/available'),
	startAttempt: (paperId: string) => apiClient.post<StartAttemptResult>(`/exams/papers/${paperId}/start`, {}),
	submitAttempt: (paperId: string, answers: AnswerPayload[]) =>
		apiClient.post<{ attempt_id: string; auto_score: number; has_essay: boolean; late?: boolean }>(
			`/exams/papers/${paperId}/submit`,
			{ answers },
		),
};

export type { AttemptQuestion };
