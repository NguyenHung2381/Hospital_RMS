export type QuestionType = 'single_choice' | 'essay';
/** null = đề cũ, hỗn hợp cả 2 loại câu */
export type PaperType = 'multiple_choice' | 'essay';
export type PaperStatus = 'draft' | 'published' | 'closed';

export const PAPER_QUESTION_TYPE: Record<PaperType, QuestionType> = {
	multiple_choice: 'single_choice',
	essay: 'essay',
};
export type AttemptStatus = 'in_progress' | 'submitted' | 'graded';

export interface ExamQuestion {
	id: string;
	subject_id: string | null;
	subject_name?: string | null;
	question_type: QuestionType;
	question_text: string;
	options: string[];
	correct_option: string | null;
	points: number;
	/** Ảnh minh hoạ (link /uploads đã ký) — null = không có hình */
	image_url: string | null;
	used_count?: number;
}

export interface ExamPaperQuestion extends ExamQuestion {
	link_id: string;
	sort_order: number;
}

export interface ExamPaper {
	id: string;
	course_id: string;
	course_name?: string;
	subject_id: string | null;
	subject_name?: string | null;
	title: string;
	paper_type: PaperType | null;
	duration_minutes: number;
	status: PaperStatus;
	question_count: number;
	attempt_count: number;
	questions?: ExamPaperQuestion[];
	/** Phần thi: lý thuyết | thực hành (giai đoạn 4) */
	exam_part: ExamPart;
	/** Chấm ẩn danh: người chấm chỉ thấy mã bài */
	blind_grading: boolean;
	grader_ids: string[];
	grader_names: string | null;
}

export type ExamPart = 'theory' | 'practice';
export const EXAM_PART_LABEL: Record<ExamPart, string> = { theory: 'Lý thuyết', practice: 'Thực hành' };

export interface ExamAttemptSummary {
	id: string;
	paper_id: string;
	enrollment_id: string;
	trainee_name: string;
	started_at: string;
	submitted_at: string | null;
	auto_score: number | null;
	manual_score: number | null;
	status: AttemptStatus;
	pending_count: number;
}

export interface ExamAttemptAnswer {
	id: string;
	attempt_id: string;
	question_id: string;
	selected_option: string | null;
	essay_text: string | null;
	score_awarded: number | null;
	question_text: string;
	question_type: QuestionType;
	options: string[];
	correct_option: string | null;
	points: number;
	image_url: string | null;
	sort_order: number;
}

export interface ExamAttemptDetail extends ExamAttemptSummary {
	paper_title: string;
	subject_id: string | null;
	course_id: string;
	answers: ExamAttemptAnswer[];
}

// ─── Học viên làm bài ────────────────────────────────────────────────────────
export interface AvailablePaper {
	id: string;
	title: string;
	duration_minutes: number;
	course_id: string;
	course_name: string;
	enrollment_id: string;
	attempt_id: string | null;
	attempt_status: AttemptStatus | null;
}

export interface AttemptQuestion {
	id: string;
	question_type: QuestionType;
	question_text: string;
	options: string[];
	points: number;
	image_url: string | null;
	sort_order: number;
}

export interface StartAttemptResult {
	attempt: { id: string; started_at: string; status: AttemptStatus };
	duration_minutes: number;
	questions: AttemptQuestion[];
}
