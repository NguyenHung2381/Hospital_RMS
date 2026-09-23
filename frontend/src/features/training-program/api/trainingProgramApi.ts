import { apiClient } from '../../../shared/api/axios';
import type {
	Lesson,
	LessonDocument,
	LessonFormData,
	ProgramLessonLink,
	ProgramResultRow,
	TrainingProgram,
	TrainingProgramFormData,
	TrainingProgramListResponse,
} from '../types/trainingProgram.type';

export type LessonDocumentSource = { type: 'file'; file: File } | { type: 'link'; external_url: string };

export const getTrainingPrograms = () =>
	apiClient.get<TrainingProgramListResponse>('/training-programs?limit=0');

const toPayload = (form: TrainingProgramFormData) => ({
	name: form.name,
	code: form.code || null,
	duration: form.duration || null,
	department_id: form.department_id || null,
	trainee_type_id: form.trainee_type_id || null,
	max_capacity: form.max_capacity ? Number(form.max_capacity) : null,
	display_order: form.display_order ? Number(form.display_order) : 0,
	description: form.description || null,
});

export const createTrainingProgram = (form: TrainingProgramFormData) =>
	apiClient.post<TrainingProgram>('/training-programs', toPayload(form));

export const updateTrainingProgram = (id: string, form: TrainingProgramFormData) =>
	apiClient.put<TrainingProgram>(`/training-programs/${id}`, toPayload(form));

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

// Gắn 1 bài học ĐÃ CÓ (đang thuộc chương trình khác) vào thêm chương trình này
export const linkLesson = (programId: string, lessonId: string, displayOrder: number) =>
	apiClient.post<{ id: string }>(`/training-programs/${programId}/lessons/link`, {
		lesson_id: lessonId,
		display_order: displayOrder,
	});

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

// Đổi thứ tự hiển thị của 1 LƯỢT GẮN (không ảnh hưởng chương trình khác)
export const updateLessonLink = (linkId: string, displayOrder: number) =>
	apiClient.put<null>(`/training-programs/lesson-links/${linkId}`, { display_order: displayOrder });

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

// ─── Kết quả học tập theo chương trình (view chỉ-đọc) ──────────────────────
export const getProgramResults = (programId: string) =>
	apiClient.get<ProgramResultRow[]>(`/training-programs/${programId}/results`);
