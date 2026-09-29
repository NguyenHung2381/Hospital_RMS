export type ModalType = 'add' | 'edit' | 'delete' | null;

export interface TrainingProgram {
	id: string;
	name: string;
	code: string | null;
	duration: string | null;
	department_id: string | null;
	department_name: string | null;
	trainee_type_id: string | null;
	trainee_type_name: string | null;
	max_capacity: number | null;
	display_order: number;
	description: string | null;
	created_at: string;
	course_count?: number;
	lesson_count?: number;
}

export interface TrainingProgramFormData {
	name: string;
	code: string;
	duration: string;
	department_id: string;
	trainee_type_id: string;
	max_capacity: string;
	display_order: string;
	description: string;
}

export interface TrainingProgramListResponse {
	data: TrainingProgram[];
	pagination: { page: number; limit: number; total: number };
}

// ─── Bài học (nội dung dùng chung, tách khỏi lịch học cụ thể của khóa — xem
// module Khóa học / class_sessions). 1 bài học có thể gắn vào NHIỀU chương
// trình đào tạo (N:N qua lesson_programs) — Lesson là nội dung dùng chung,
// ProgramLessonLink là 1 lượt gắn vào 1 chương trình cụ thể (mang display_order
// riêng của chương trình đó). ─────────────────────────────────────────────────
export interface Lesson {
	id: string;
	code: string;
	title: string;
	description: string | null;
	is_active: boolean;
	theory_hours: number;
	practice_hours: number;
	total_hours: number;
	credits: number;
	program_names: string | null;
	created_at: string;
}

export interface ProgramLessonLink {
	id: string; // id của lượt gắn (lesson_programs), KHÔNG phải id bài học
	program_id: string;
	lesson_id: string;
	code: string;
	title: string;
	description: string | null;
	is_active: boolean;
	theory_hours: number;
	practice_hours: number;
	total_hours: number;
	credits: number;
	display_order: number;
	created_at: string;
}

// Form đầy đủ cho 1 bài học (nội dung dùng chung) — dùng chung cho tạo mới &
// sửa; program_ids là danh sách chương trình đào tạo đang áp dụng (multi-select).
export interface LessonFormData {
	code: string;
	title: string;
	description: string;
	is_active: boolean;
	theory_hours: string;
	practice_hours: string;
	credits: string;
	program_ids: string[];
}

export const EMPTY_LESSON_FORM: LessonFormData = {
	code: '',
	title: '',
	description: '',
	is_active: true,
	theory_hours: '0',
	practice_hours: '0',
	credits: '0',
	program_ids: [],
};

export type SourceType = 'file' | 'link';

export interface LessonDocument {
	id: string;
	lesson_id: string;
	title: string;
	is_public: boolean;
	download_count: number;
	created_at: string;
	source_type: SourceType;
	external_url: string | null;
	file_name: string | null;
	file_url: string | null;
	mime_type: string | null;
	file_size: number | null;
}

// ─── Kết quả học tập theo chương trình (view chỉ-đọc, dữ liệu từ grades ở
// module Khóa học, gom theo chương trình — xem trainingProgramService.
// listProgramResults). Sửa điểm vẫn thực hiện ở màn Khóa học. ────────────────
export interface ProgramResultRow {
	id: string;
	trainee_id: string;
	trainee_name: string;
	course_id: string;
	course_name: string;
	regular_score: number | null;
	midterm_score: number | null;
	final_score: number | null;
	score: number | null;
	classification: string | null;
	result: string | null;
	note: string | null;
}

export const EMPTY_FORM: TrainingProgramFormData = {
	name: '',
	code: '',
	duration: '',
	department_id: '',
	trainee_type_id: '',
	max_capacity: '',
	display_order: '0',
	description: '',
};

// Chương trình không có cột trạng thái trong DB — suy ra từ việc đã mở khóa học
// nào theo chương trình hay chưa.
export type ProgramStatus = 'active' | 'unused';
export type ProgramStatusFilter = 'all' | ProgramStatus;

export const PROGRAM_STATUS_LABELS: Record<ProgramStatus, string> = {
	active: 'Đang triển khai',
	unused: 'Chưa triển khai',
};

export const getProgramStatus = (p: Pick<TrainingProgram, 'course_count'>): ProgramStatus =>
	(p.course_count ?? 0) > 0 ? 'active' : 'unused';
