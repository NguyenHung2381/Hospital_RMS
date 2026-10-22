export type QuestionType = 'single_choice' | 'essay';
/** null = đề cũ, hỗn hợp cả 2 loại câu */
export type PaperType = 'multiple_choice' | 'essay';
export type PaperStatus = 'draft' | 'published' | 'closed';

export const PAPER_QUESTION_TYPE: Record<PaperType, QuestionType> = {
	multiple_choice: 'single_choice',
	essay: 'essay',
};
export type AttemptStatus = 'in_progress' | 'submitted' | 'graded';
/** Kho câu hỏi của chương trình / mục đích đề: kiểm tra đầu vào hay thi cuối khóa */
export type QuestionPool = 'entrance' | 'final';
export const POOL_LABEL: Record<QuestionPool, string> = { entrance: 'Kiểm tra đầu vào', final: 'Thi cuối khóa' };
/** Kiểu mã đề của đề bốc ngẫu nhiên */
export type CodeMode = 'per_trainee' | 'shuffled' | 'codes';
export const CODE_MODE_LABEL: Record<CodeMode, string> = {
	per_trainee: 'Mỗi học viên một đề',
	shuffled: 'Chung đề, trộn thứ tự',
	codes: 'Nhiều mã đề',
};

export interface ExamQuestion {
	id: string;
	subject_id: string | null;
	subject_name?: string | null;
	/** Ngân hàng của chương trình nào (null = câu cũ chưa thuộc chương trình) */
	program_id: string | null;
	program_code?: string | null;
	program_name?: string | null;
	pool: QuestionPool;
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
	/** Đề nhiều mã: câu thuộc mã đề số mấy */
	code_no: number | null;
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
	purpose: QuestionPool;
	/** Lớp (chương trình trong khóa) — lấy câu từ ngân hàng của chương trình này */
	program_id: string | null;
	program_code?: string | null;
	program_name?: string | null;
	/** Bốc ngẫu nhiên: số câu trắc nghiệm / tự luận (null cả 2 = đề chọn câu tay) */
	gen_mc_count: number | null;
	gen_essay_count: number | null;
	code_mode: CodeMode | null;
	code_count: number | null;
	/** Trọng số (%) trong điểm lý thuyết — TN × a% + TL × b% */
	weight: number | null;
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
	/** Lần thi (thi lại = lượt mới) */
	attempt_no?: number;
	code_no?: number | null;
	score10?: number | null;
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
	purpose?: QuestionPool;
	/** Được thi lại: lần thi mới (lượt cũ đã nộp) */
	retake_no?: number;
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
