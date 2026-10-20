import { apiClient } from '../../../shared/api/axios';
import type {
	Lesson,
	LessonDocument,
	LessonFormData,
	ProgramLessonLink,
	ProgramResultRow,
	ProgramRotation,
	RotationDraft,
	TrainingProgram,
	TrainingProgramFormData,
	TrainingProgramListResponse,
} from '../types/trainingProgram.type';

export type LessonDocumentSource = { type: 'file'; file: File } | { type: 'link'; external_url: string };

export const getTrainingPrograms = () =>
	apiClient.get<TrainingProgramListResponse>('/training-programs?limit=0');

const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

const toPayload = (form: TrainingProgramFormData) => ({
	name: form.name,
	code: form.code || null,
	// Có số thì server tự sinh chữ hiển thị ("03 tháng"); không thì giữ chữ cũ.
	duration: form.duration || null,
	duration_value: numOrNull(form.duration_value),
	duration_unit: form.duration_value.trim() ? form.duration_unit : null,
	department_id: form.department_id || null,
	department_note: form.department_note || null,
	trainee_type_id: form.trainee_type_id || null,
	training_type_id: form.training_type_id || null,
	target_audience: form.target_audience || null,
	theory_hours: numOrNull(form.theory_hours),
	practice_hours: numOrNull(form.practice_hours),
	credit_hours: numOrNull(form.credit_hours),
	tuition_fee: numOrNull(form.tuition_fee),
	min_capacity: form.min_capacity ? Number(form.min_capacity) : null,
	max_capacity: form.max_capacity ? Number(form.max_capacity) : null,
	display_order: form.display_order ? Number(form.display_order) : 0,
	description: form.description || null,
});

export const createTrainingProgram = (form: TrainingProgramFormData) =>
	apiClient.post<TrainingProgram>('/training-programs', toPayload(form));

export const updateTrainingProgram = (id: string, form: TrainingProgramFormData) =>
	apiClient.put<TrainingProgram>(`/training-programs/${id}`, toPayload(form));

// Đồng bộ vòng thực hành nhập ở form chương trình: gỡ vòng bị xoá (bài học vẫn
// giữ cho hồ sơ cũ), sửa vòng có sẵn, tạo + gắn vòng mới.
export const syncProgramRotations = async (
	programId: string,
	programCode: string,
	before: ProgramRotation[],
	after: RotationDraft[],
) => {
	const keep = new Set(after.map((r) => r.link_id).filter(Boolean));
	for (const r of before) if (!keep.has(r.link_id)) await unlinkLesson(r.link_id);

	const fields = (r: RotationDraft) => ({
		title: r.title.trim(),
		duration_value: r.duration_value.trim() ? Number(r.duration_value) : null,
		duration_unit: r.duration_value.trim() ? r.duration_unit : null,
		department_ids: r.department_ids,
	});
	const newIds: string[] = [];
	for (const [i, r] of after.entries()) {
		if (r.lesson_id) await apiClient.put<null>(`/training-programs/lessons/${r.lesson_id}`, fields(r));
		else {
			const { id } = await apiClient.post<{ id: string }>('/training-programs/lessons', {
				...fields(r),
				code: `${programCode}_V${i + 1}`,
				lesson_kind: 'rotation',
			});
			newIds.push(id);
		}
	}
	if (newIds.length) await linkLessons(programId, newIds);
};

export const deleteTrainingProgram = (id: string) =>
	apiClient.delete<null>(`/training-programs/${id}`);

// ─── Bài học — 1 bài học (nội dung dùng chung) có thể gắn vào NHIỀU chương
// trình đào tạo (N:N). getLessons trả về các LƯỢT GẮN của 1 chương trình cụ
// thể; getAllLessons trả về toàn bộ nội dung bài học đang có, dùng cho picker
// "đính kèm bài học có sẵn" thay vì tạo trùng nội dung. ──────────────────────
export const getLessons = (programId: string) =>
	apiClient.get<ProgramLessonLink[]>(`/training-programs/${programId}/lessons`);

export const getAllLessons = () => apiClient.get<Lesson[]>('/training-programs/lessons/all');

const lessonPayload = (data: LessonFormData) => ({
	code: data.code,
	title: data.title,
	description: data.description || null,
	is_active: data.is_active,
	theory_hours: data.theory_hours ? Number(data.theory_hours) : 0,
	practice_hours: data.practice_hours ? Number(data.practice_hours) : 0,
	credits: data.credits ? Number(data.credits) : 0,
	lesson_kind: data.lesson_kind,
	duration_value: data.duration_value.trim() ? Number(data.duration_value) : null,
	duration_unit: data.duration_value.trim() ? data.duration_unit : null,
	allow_split: data.lesson_kind === 'rotation' && data.allow_split,
	department_ids: data.lesson_kind === 'rotation' ? data.department_ids : [],
});

// Tạo bài học mới — chương trình áp dụng lưu riêng qua setLessonPrograms
// (gọi sau khi tạo xong, xem LessonFormModal).
export const createLesson = (data: LessonFormData) =>
	apiClient.post<{ id: string }>('/training-programs/lessons', lessonPayload(data));

// Sửa nội dung DÙNG CHUNG (không gồm program_ids) — ảnh hưởng mọi chương
// trình đang gắn bài học này.
export const updateLesson = (lessonId: string, data: LessonFormData) =>
	apiClient.put<null>(`/training-programs/lessons/${lessonId}`, lessonPayload(data));

// Chương trình đào tạo đang gắn với 1 bài học — khởi tạo multi-select khi sửa
export const getLessonPrograms = (lessonId: string) =>
	apiClient.get<string[]>(`/training-programs/lessons/${lessonId}/programs`);

// Gán LẠI TOÀN BỘ danh sách chương trình cho 1 bài học (multi-select ở form)
export const setLessonPrograms = (lessonId: string, programIds: string[]) =>
	apiClient.put<string[]>(`/training-programs/lessons/${lessonId}/programs`, { program_ids: programIds });

// Đính kèm NHIỀU bài học có sẵn cùng lúc (checkbox multi-select)
export const linkLessons = (programId: string, lessonIds: string[]) =>
	apiClient.post<{ linked: number }>(`/training-programs/${programId}/lessons/link-many`, {
		lesson_ids: lessonIds,
	});

// Sắp xếp lại toàn bộ thứ tự bài học của 1 chương trình (sau khi kéo-thả)
export const reorderLessons = (programId: string, linkIds: string[]) =>
	apiClient.put<ProgramLessonLink[]>(`/training-programs/${programId}/lessons/reorder`, {
		link_ids: linkIds,
	});

// Gỡ bài học khỏi 1 chương trình (không xoá nội dung nếu còn chương trình
// khác đang dùng chung — server tự dọn khi đây là lượt gắn cuối cùng)
export const unlinkLesson = (linkId: string) =>
	apiClient.delete<null>(`/training-programs/lesson-links/${linkId}`);

// Xoá hẳn bài học (mọi chương trình đang dùng sẽ mất luôn — dùng cẩn thận)
export const deleteLesson = (lessonId: string) =>
	apiClient.delete<null>(`/training-programs/lessons/${lessonId}`);

// ─── Tài liệu bài học ────────────────────────────────────────────────────
export const getLessonDocuments = (lessonId: string) =>
	apiClient.get<LessonDocument[]>(`/training-programs/lessons/${lessonId}/documents`);

export const addLessonDocument = (
	lessonId: string,
	source: LessonDocumentSource,
	data: { title: string; is_public: boolean },
) => {
	const form = new FormData();
	form.append('source_type', source.type);
	if (source.type === 'file') form.append('file', source.file);
	else form.append('external_url', source.external_url);
	form.append('title', data.title);
	form.append('is_public', String(data.is_public));
	return apiClient.postForm<{ id: string }>(`/training-programs/lessons/${lessonId}/documents`, form);
};

export const removeLessonDocument = (docId: string) =>
	apiClient.delete<null>(`/training-programs/lesson-documents/${docId}`);

export const incrementLessonDocumentDownload = (docId: string) =>
	apiClient.patch<{ download_count: number }>(`/training-programs/lesson-documents/${docId}/download`, {});

// ─── Nhập danh mục chương trình + vòng thực hành từ Excel (mẫu 1.xlsx) ─────
export interface CatalogImportProgramRow {
	row: number;
	status: 'new' | 'update';
	code: string;
	name: string;
	training_type_id: string | null;
	department_name: string | null;
	department_note: string | null;
	duration: string | null;
	target_audience: string | null;
}
export interface CatalogImportLessonRow {
	row: number;
	status: 'new' | 'update';
	program_code: string;
	code: string;
	title: string;
	duration: string | null;
	allow_split: boolean;
	departments: { id: string; name: string }[];
}
export interface CatalogImportResult {
	dry_run: boolean;
	summary: { programs_total: number; programs_new: number; lessons_total: number; lessons_new: number };
	programs?: CatalogImportProgramRow[];
	lessons?: CatalogImportLessonRow[];
	programs_created?: number;
	programs_updated?: number;
	lessons_created?: number;
	lessons_updated?: number;
	links_created?: number;
	warnings: string[];
}

export const importProgramCatalog = (file: File, dryRun: boolean) => {
	const form = new FormData();
	form.append('file', file);
	form.append('dry_run', dryRun ? '1' : '0');
	return apiClient.postForm<CatalogImportResult>('/training-programs/import-catalog', form);
};

// ─── Kết quả học tập theo chương trình (view chỉ-đọc) ──────────────────────
export const getProgramResults = (programId: string) =>
	apiClient.get<ProgramResultRow[]>(`/training-programs/${programId}/results`);
