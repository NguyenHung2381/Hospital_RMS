import { apiClient } from '../../../shared/api/axios';
import type {
	AttendanceRow,
	Certificate,
	ClassSession,
	Course,
	CourseDocument,
	CourseFormData,
	CourseListResponse,
	DocType,
	Enrollment,
	EnrollmentStatus,
	Grade,
	LecturerAssignment,
} from '../types/course.type';

const toPayload = (form: CourseFormData) => ({
	name: form.name,
	program_id: form.program_id || null,
	training_round_id: form.training_round_id || null,
	training_form_id: form.training_form_id || null,
	start_date: form.start_date || null,
	end_date: form.end_date || null,
	capacity: form.capacity ? Number(form.capacity) : null,
	status: form.status,
	description: form.description || null,
});

export const getCourses = () => apiClient.get<CourseListResponse>('/courses?limit=0');
export const getCourse = (id: string) => apiClient.get<Course>(`/courses/${id}`);
export const createCourse = (form: CourseFormData) => apiClient.post<Course>('/courses', toPayload(form));
export const updateCourse = (id: string, form: CourseFormData) =>
	apiClient.put<Course>(`/courses/${id}`, toPayload(form));
export const deleteCourse = (id: string) => apiClient.delete<null>(`/courses/${id}`);

// ─── Enrollments ──────────────────────────────────────────────────────────
export const getEnrollments = (courseId: string) =>
	apiClient.get<Enrollment[]>(`/courses/${courseId}/enrollments`);
export const registerTrainee = (courseId: string, traineeId: string) =>
	apiClient.post<{ id: string }>(`/courses/${courseId}/enrollments`, { trainee_id: traineeId });
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

// ─── Attendance ───────────────────────────────────────────────────────────
export const getAttendance = (sessionId: string) =>
	apiClient.get<AttendanceRow[]>(`/courses/sessions/${sessionId}/attendance`);
export const saveAttendance = (
	sessionId: string,
	records: { enrollment_id: string; status: string; note?: string }[],
) => apiClient.put<null>(`/courses/sessions/${sessionId}/attendance`, { records });

// ─── Documents (tài liệu & bài kiểm tra) ────────────────────────────────────
export const getDocuments = (courseId: string) =>
	apiClient.get<CourseDocument[]>(`/courses/${courseId}/documents`);

export const addDocument = (
	courseId: string,
	file: File,
	data: { doc_type: DocType; title: string; is_public: boolean },
) => {
	const form = new FormData();
	form.append('file', file);
	form.append('doc_type', data.doc_type);
	form.append('title', data.title);
	form.append('is_public', String(data.is_public));
	return apiClient.postForm<{ id: string }>(`/courses/${courseId}/documents`, form);
};

export const removeDocument = (docId: string) => apiClient.delete<null>(`/courses/documents/${docId}`);

// ─── Grades ───────────────────────────────────────────────────────────────
export const getGrades = (courseId: string) => apiClient.get<Grade[]>(`/courses/${courseId}/grades`);

export const upsertGrade = (data: {
	enrollment_id: string;
	subject_id?: string;
	score?: number;
	result?: string;
	note?: string;
}) => apiClient.post<{ id: string }>('/courses/grades', data);

export const removeGrade = (gradeId: string) => apiClient.delete<null>(`/courses/grades/${gradeId}`);

// ─── Certificates ───────────────────────────────────────────────────────────
export const getCertificates = (courseId: string) =>
	apiClient.get<Certificate[]>(`/courses/${courseId}/certificates`);

export const issueCertificate = (enrollmentId: string) =>
	apiClient.post<{ id: string; cert_no: string }>('/courses/certificates', { enrollment_id: enrollmentId });

export const removeCertificate = (certId: string) => apiClient.delete<null>(`/courses/certificates/${certId}`);
