export type ModalType = 'add' | 'edit' | 'delete' | 'import' | null;

// ─── Thời lượng (chương trình / vòng thực hành) — lưu số + đơn vị ─────────
export type DurationUnit = 'day' | 'week' | 'month';
export const DURATION_UNIT_LABEL: Record<DurationUnit, string> = { day: 'ngày', week: 'tuần', month: 'tháng' };
const DAYS_PER_UNIT: Record<DurationUnit, number> = { day: 1, week: 7, month: 30 };

/** Quy đổi xấp xỉ ra ngày — chỉ để so tổng các vòng với thời lượng chương trình. */
export const durationDays = (value: number | null, unit: DurationUnit | null) =>
	value != null && unit ? Number(value) * DAYS_PER_UNIT[unit] : null;

export const formatDuration = (value: number | null, unit: DurationUnit | null) =>
	value != null && unit ? `${String(Number(value)).replace('.', ',')} ${DURATION_UNIT_LABEL[unit]}` : null;

export type LessonKind = 'theory' | 'rotation';
export const LESSON_KIND_LABEL: Record<LessonKind, string> = {
	theory: 'Bài học',
	rotation: 'Vòng thực hành',
};

export interface TrainingProgram {
	id: string;
	name: string;
	code: string | null;
	duration: string | null;
	duration_value: number | null;
	duration_unit: DurationUnit | null;
	department_id: string | null;
	department_name: string | null;
	/** Ghi chú khoa phụ trách: "Nhiều khoa tùy vòng…" hoặc tên khoa chưa có trong danh mục. */
	department_note: string | null;
	/** Đối tượng đầu tiên — cột cũ, giữ cho tương thích. Dùng trainee_type_ids. */
	trainee_type_id: string | null;
	/** Đối tượng học viên (danh mục), theo thứ tự. */
	trainee_type_ids: string[];
	/** Tên các đối tượng, nối bằng ", ". */
	trainee_type_name: string | null;
	training_type_id: string | null;
	training_type_name: string | null;
	/** Đối tượng học viên dạng chữ tự do ("Bác sĩ, Điều dưỡng, KTV"). */
	target_audience: string | null;
	theory_hours: number | null;
	practice_hours: number | null;
	total_hours: number;
	credit_hours: number | null;
	tuition_fee: number | null;
	min_capacity: number | null;
	max_capacity: number | null;
	display_order: number;
	description: string | null;
	created_at: string;
	course_count?: number;
	lesson_count?: number;
	/** Vòng thực hành (GPHN) theo thứ tự — mỗi vòng 1 khoa (hoặc vài khoa để chọn) + thời lượng riêng. */
	rotations?: ProgramRotation[];
}

export interface ProgramRotation {
	link_id: string;
	lesson_id: string;
	title: string;
	duration_value: number | null;
	duration_unit: DurationUnit | null;
	department_ids: string | null;
	department_names: string | null;
}

export interface TrainingProgramFormData {
	name: string;
	code: string;
	duration: string;
	duration_value: string;
	duration_unit: DurationUnit;
	department_id: string;
	department_note: string;
	trainee_type_ids: string[];
	training_type_id: string;
	target_audience: string;
	theory_hours: string;
	practice_hours: string;
	credit_hours: string;
	tuition_fee: string;
	min_capacity: string;
	max_capacity: string;
	display_order: string;
	description: string;
	/** Vòng thực hành nhập ngay trong form chương trình — lưu thành bài học loại 'rotation'. */
	rotations: RotationDraft[];
}

export interface RotationDraft {
	/** Có = vòng đã lưu (sửa tại chỗ); không = vòng mới. */
	lesson_id?: string;
	link_id?: string;
	title: string;
	duration_value: string;
	duration_unit: DurationUnit;
	department_ids: string[];
}

export const EMPTY_ROTATION: RotationDraft = { title: '', duration_value: '', duration_unit: 'month', department_ids: [] };

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
	lesson_kind: LessonKind;
	duration_value: number | null;
	duration_unit: DurationUnit | null;
	allow_split: boolean;
	/** Khoa được chọn cho vòng thực hành — id nối bằng dấu phẩy. */
	department_ids: string | null;
	department_names: string | null;
	program_names: string | null;
	/** Id chương trình đang dùng bài học, nối bằng dấu phẩy (null = chưa thuộc chương trình nào). */
	program_ids: string | null;
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
	lesson_kind: LessonKind;
	duration_value: number | null;
	duration_unit: DurationUnit | null;
	allow_split: boolean;
	department_ids: string | null;
	department_names: string | null;
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
	lesson_kind: LessonKind;
	duration_value: string;
	duration_unit: DurationUnit;
	allow_split: boolean;
	department_ids: string[];
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
	lesson_kind: 'theory',
	duration_value: '',
	duration_unit: 'month',
	allow_split: false,
	department_ids: [],
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
	duration_value: '',
	duration_unit: 'month',
	department_id: '',
	department_note: '',
	trainee_type_ids: [],
	training_type_id: '',
	target_audience: '',
	theory_hours: '',
	practice_hours: '',
	credit_hours: '',
	tuition_fee: '',
	min_capacity: '',
	max_capacity: '',
	display_order: '0',
	description: '',
	rotations: [],
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
