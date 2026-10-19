import { apiClient } from '../../../shared/api/axios';
import { getCheckInDeviceId } from '../../../shared/utils/storage';
import type {
	AttendanceRow,
	Certificate,
	ClassSession,
	Course,
	CourseDocument,
	CourseFormData,
	CourseListResponse,
	CourseProgramLink,
	DocType,
	Enrollment,
	EnrollmentLesson,
	EnrollmentLessonStatus,
	EnrollmentStatus,
	EnrollmentUpdate,
	Grade,
	LecturerAssignment,
} from '../types/course.type';

export type DocumentSource = { type: 'file'; file: File } | { type: 'link'; external_url: string };

const toPayload = (form: CourseFormData) => ({
	name: form.name,
	program_ids: form.program_ids,
	training_form_id: form.training_form_id || null,
	training_type_id: form.training_type_id || null,
	batch_no: form.batch_no ? Number(form.batch_no) : null,
	is_rolling: form.is_rolling,
	start_date: form.start_date || null,
	end_date: form.end_date || null,
	enrollment_start_date: form.enrollment_start_date || null,
	enrollment_end_date: form.enrollment_end_date || null,
	capacity: form.capacity ? Number(form.capacity) : null,
	status: form.status,
	is_public_registration: form.is_public_registration,
	description: form.description || null,
	prerequisites: form.prerequisites.map((s) => s.trim()).filter(Boolean),
	objectives: form.objectives.map((s) => s.trim()).filter(Boolean),
});

export interface CourseListParams {
	page?: number;
	limit?: number;
	search?: string;
	program_id?: string;
	status?: string;
}

// Không truyền params → giữ hành vi cũ: lấy toàn bộ khóa học.
export const getCourses = (params?: CourseListParams) => {
	const merged = { limit: 0, ...params };
	const entries = Object.entries(merged)
		.filter(([, v]) => v !== undefined && v !== '')
		.map(([k, v]) => [k, String(v)] as [string, string]);
	return apiClient.get<CourseListResponse>(`/courses?${new URLSearchParams(entries).toString()}`);
};
export const getCourse = (id: string) => apiClient.get<Course>(`/courses/${id}`);
export const createCourse = (form: CourseFormData) => apiClient.post<Course>('/courses', toPayload(form));
export const updateCourse = (id: string, form: CourseFormData) =>
	apiClient.put<Course>(`/courses/${id}`, toPayload(form));
export const deleteCourse = (id: string) => apiClient.delete<null>(`/courses/${id}`);

// ─── Chương trình đào tạo áp dụng (N:N, gán qua program_ids của form khóa học) ──
export const getProgramLinks = (courseId: string) =>
	apiClient.get<CourseProgramLink[]>(`/courses/${courseId}/programs`);

// ─── Enrollments ──────────────────────────────────────────────────────────
export const getEnrollments = (courseId: string) =>
	apiClient.get<Enrollment[]>(`/courses/${courseId}/enrollments`);
/** programId: chương trình học viên chọn — bài học của chương trình tự gắn theo. */
export const registerTrainee = (courseId: string, traineeId: string, programId?: string) =>
	apiClient.post<{ id: string }>(`/courses/${courseId}/enrollments`, {
		trainee_id: traineeId,
		program_id: programId || null,
	});
/** Ghi danh nhân viên nội viện (users) — backend tự tạo/gắn hồ sơ học viên. */
export const registerStaff = (courseId: string, userId: string, programId?: string) =>
	apiClient.post<{ id: string }>(`/courses/${courseId}/enrollments`, {
		user_id: userId,
		program_id: programId || null,
	});
export const updateEnrollment = (enrollmentId: string, data: EnrollmentUpdate) =>
	apiClient.put<null>(`/courses/enrollments/${enrollmentId}`, data);
export const getEnrollmentLessons = (enrollmentId: string) =>
	apiClient.get<EnrollmentLesson[]>(`/courses/enrollments/${enrollmentId}/lessons`);
export const syncEnrollmentLessons = (enrollmentId: string) =>
	apiClient.post<{ added: number }>(`/courses/enrollments/${enrollmentId}/lessons/sync`, {});
export const updateEnrollmentLesson = (enrollmentId: string, lessonId: string, status: EnrollmentLessonStatus) =>
	apiClient.put<null>(`/courses/enrollments/${enrollmentId}/lessons`, { lesson_id: lessonId, status });
export const decideEnrollment = (enrollmentId: string, status: EnrollmentStatus, note?: string) =>
	apiClient.put<{ id: string; status: string }>(`/courses/enrollments/${enrollmentId}/decide`, { status, note });
export const removeEnrollment = (enrollmentId: string) =>
	apiClient.delete<null>(`/courses/enrollments/${enrollmentId}`);

// ─── Lecturer assignments ─────────────────────────────────────────────────
export const getAssignments = (courseId: string) =>
	apiClient.get<LecturerAssignment[]>(`/courses/${courseId}/lecturer-assignments`);
export const assignLecturer = (
	courseId: string,
	data: { lecturer_id: string; subject_id?: string; note?: string },
) => apiClient.post<{ id: string }>(`/courses/${courseId}/lecturer-assignments`, data);
export const removeAssignment = (assignmentId: string) =>
	apiClient.delete<null>(`/courses/lecturer-assignments/${assignmentId}`);

// ─── Class sessions ───────────────────────────────────────────────────────
export const getSessions = (courseId: string) =>
	apiClient.get<ClassSession[]>(`/courses/${courseId}/sessions`);
export const createSession = (
	courseId: string,
	data: { subject_id?: string; lecturer_id?: string; session_date: string; start_time?: string; end_time?: string; room?: string },
) => apiClient.post<{ id: string }>(`/courses/${courseId}/sessions`, data);
export const removeSession = (sessionId: string) => apiClient.delete<null>(`/courses/sessions/${sessionId}`);
export const createSessionsBulk = (
	courseId: string,
	data: {
		start_date: string;
		end_date: string;
		weekdays: number[];
		start_time?: string;
		end_time?: string;
		room?: string;
		lecturer_id?: string;
		subject_id?: string;
	},
) => apiClient.post<{ created: number; skipped: number }>(`/courses/${courseId}/sessions/bulk`, data);

// ─── Attendance ───────────────────────────────────────────────────────────
export const getAttendance = (sessionId: string) =>
	apiClient.get<AttendanceRow[]>(`/courses/sessions/${sessionId}/attendance`);
export const saveAttendance = (
	sessionId: string,
	records: { enrollment_id: string; status: string; note?: string }[],
) => apiClient.put<null>(`/courses/sessions/${sessionId}/attendance`, { records });

export const getAttendanceQrToken = (sessionId: string) =>
	apiClient.get<{ token: string }>(`/courses/sessions/${sessionId}/attendance-qr`);

export const checkInAttendance = (token: string) =>
	apiClient.post<{ session_id: string }>('/courses/attendance/check-in', {
		token,
		device_id: getCheckInDeviceId(),
	});

// ─── Documents (tài liệu & bài kiểm tra) ────────────────────────────────────
export const getDocuments = (courseId: string) =>
	apiClient.get<CourseDocument[]>(`/courses/${courseId}/documents`);

export const addDocument = (
	courseId: string,
	source: DocumentSource,
	data: { doc_type: DocType; title: string; is_public: boolean },
) => {
	const form = new FormData();
	form.append('source_type', source.type);
	if (source.type === 'file') form.append('file', source.file);
	else form.append('external_url', source.external_url);
	form.append('doc_type', data.doc_type);
	form.append('title', data.title);
	form.append('is_public', String(data.is_public));
	return apiClient.postForm<{ id: string }>(`/courses/${courseId}/documents`, form);
};

export const removeDocument = (docId: string) => apiClient.delete<null>(`/courses/documents/${docId}`);
export const incrementDocumentDownload = (docId: string) =>
	apiClient.patch<{ download_count: number }>(`/courses/documents/${docId}/download`, {});

// ─── Grades ───────────────────────────────────────────────────────────────
export const getGrades = (courseId: string) => apiClient.get<Grade[]>(`/courses/${courseId}/grades`);

export const upsertGrade = (data: {
	enrollment_id: string;
	subject_id?: string;
	program_id?: string;
	score?: number;
	result?: string;
	regular_score?: number;
	midterm_score?: number;
	final_score?: number;
	note?: string;
}) => apiClient.post<{ id: string }>('/courses/grades', data);

// ─── Certificates ───────────────────────────────────────────────────────────
export const getCertificates = (courseId: string) =>
	apiClient.get<Certificate[]>(`/courses/${courseId}/certificates`);

export const issueCertificate = (enrollmentId: string, expiryDate?: string) =>
	apiClient.post<{ id: string; cert_no: string }>('/courses/certificates', {
		enrollment_id: enrollmentId,
		expiry_date: expiryDate || null,
	});

export const removeCertificate = (certId: string) => apiClient.delete<null>(`/courses/certificates/${certId}`);
export const revokeCertificate = (certId: string, reason?: string) =>
	apiClient.patch<null>(`/courses/certificates/${certId}/revoke`, { reason: reason || null });
