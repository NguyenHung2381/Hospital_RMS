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
	EnrollmentStatus,
	EnrollmentUpdate,
	MentorOption,
	PracticeBoard,
	PracticeRecordRow,
	PracticeResultList,
	PracticeResultSave,
	RotationList,
	RotationUpdate,
	Grade,
	SessionKind,
	GradeBulkRow,
	Gradebook,
	GradeHistoryItem,
	GradePart,
	LecturerAssignment,
	CourseLesson,
	LessonLecturersInput,
} from '../types/course.type';
import { CLASS_TYPES } from '../types/course.type';

export type DocumentSource = { type: 'file'; file: File } | { type: 'link'; external_url: string };

const toPayload = (form: CourseFormData) => ({
	name: form.name,
	program_ids: form.program_ids,
	training_form_id: form.training_form_id || null,
	training_type_id: form.training_type_id || null,
	batch_no: form.batch_no ? Number(form.batch_no) : null,
	is_rolling: form.is_rolling,
	// Khóa ĐTLT / CTCV: ngày khóa tự tính từ ngày các lớp — không gửi để khỏi ghi đè.
	...(CLASS_TYPES.has(form.training_type_id)
		? {}
		: { start_date: form.start_date || null, end_date: form.end_date || null }),
	enrollment_start_date: form.enrollment_start_date || null,
	enrollment_end_date: form.enrollment_end_date || null,
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
	training_type_id?: string;
	/** Bỏ khóa thuộc loại này (khi không lọc training_type_id). */
	exclude_training_type_id?: string;
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
type ClassDates = { start_date: string | null; end_date: string | null };
/** Lớp (chương trình trong khóa ĐTLT / CTCV) đủ sĩ số tối thiểu ⇒ cán bộ mở lớp, kèm ngày học. */
export const openClass = (courseId: string, programId: string, dates: ClassDates) =>
	apiClient.post<{ opened: boolean; trainees: number }>(`/courses/${courseId}/programs/open`, {
		program_id: programId,
		...dates,
	});
/** Hủy mở lớp: lớp về trạng thái chờ mở, học viên giữ nguyên (lớp đã có buổi học thì bị chặn). */
export const cancelOpenClass = (courseId: string, programId: string) =>
	apiClient.post<{ cancelled: boolean; trainees: number }>(`/courses/${courseId}/programs/cancel-open`, {
		program_id: programId,
	});
export const setClassDates =(courseId: string, programId: string, dates: ClassDates) =>
	apiClient.put<ClassDates>(`/courses/${courseId}/programs/dates`, { program_id: programId, ...dates });
/** Gợi ý ngày học (backend utils/classDates.js). */
export interface ClassDateSuggestion {
	start_date: string;
	end_date: string | null;
	workdays: number | null;
	needed_days: number | null;
	warning: string | null;
}
export const suggestClassDates = (courseId: string, programId: string) =>
	apiClient.get<ClassDateSuggestion>(
		`/courses/${courseId}/programs/suggest-dates?program_id=${encodeURIComponent(programId)}`,
	);

// ─── Enrollments ──────────────────────────────────────────────────────────
export const getEnrollments = (courseId: string) =>
	apiClient.get<Enrollment[]>(`/courses/${courseId}/enrollments`);
export const getEnrollment = (enrollmentId: string) =>
	apiClient.get<Enrollment>(`/courses/enrollments/${enrollmentId}`);
/** Hồ sơ thực hành GPHN trên mọi khóa (màn "Hồ sơ thực hành GPHN"). */
export const getPracticeRecords = () => apiClient.get<PracticeRecordRow[]>('/courses/practice-records');
/** Vòng đã kết thúc chưa có kết quả — màn "Nhập kết quả vòng" (Phòng Đào tạo nhập hộ từ phiếu giấy). */
export const getPracticeResults = () => apiClient.get<PracticeResultList>('/courses/practice-results');
export const savePracticeResults = (rows: PracticeResultSave[]) =>
	apiClient.put<{ saved: number; failed: { id: string; message: string }[] }>('/courses/practice-results/bulk', { rows });
/** programId: chương trình học viên chọn — bài học của chương trình tự gắn theo. */
/** Ghi danh hộ được duyệt luôn — đủ sĩ số thì status = 'waitlisted'. Khóa GPHN: xếp lịch vòng là bước sau. */
/** waitlist_position: vị trí trong danh sách chờ đợt sau của chương trình (nội viện, lớp đầy). */
type RegisterResult = {
	id: string;
	status: EnrollmentStatus;
	waitlist_position?: number | null;
};
export const registerTrainee = (courseId: string, traineeId: string, programId?: string) =>
	apiClient.post<RegisterResult>(`/courses/${courseId}/enrollments`, {
		trainee_id: traineeId,
		program_id: programId || null,
	});
/** Ghi danh nhân viên nội viện (users) — backend tự tạo/gắn hồ sơ học viên. */
export const registerStaff = (courseId: string, userId: string, programId?: string) =>
	apiClient.post<RegisterResult>(`/courses/${courseId}/enrollments`, {
		user_id: userId,
		program_id: programId || null,
	});
export const updateEnrollment = (enrollmentId: string, data: EnrollmentUpdate) =>
	apiClient.put<null>(`/courses/enrollments/${enrollmentId}`, data);
export const getEnrollmentLessons = (enrollmentId: string) =>
	apiClient.get<EnrollmentLesson[]>(`/courses/enrollments/${enrollmentId}/lessons`);
export const syncEnrollmentLessons = (enrollmentId: string) =>
	apiClient.post<{ added: number }>(`/courses/enrollments/${enrollmentId}/lessons/sync`, {});
// ─── Vòng thực hành GPHN ──────────────────────────────────────────────────
export const getRotations = (enrollmentId: string) =>
	apiClient.get<RotationList>(`/courses/enrollments/${enrollmentId}/rotations`);
/**
 * Tự động: sinh vòng, xếp lịch so le, chọn khoa / người hướng dẫn ít người nhất, điền hồ sơ.
 * Vòng đã có kết quả giữ nguyên; firstLessonId ép vòng vào trước; carryOver công nhận vòng Đạt ở hồ sơ trước.
 */
export const autoArrangeRotations = (
	enrollmentId: string,
	startDate: string | null,
	opts: { replace?: boolean; firstLessonId?: string | null; carryOver?: boolean } = {},
) =>
	apiClient.post<RotationList>(`/courses/enrollments/${enrollmentId}/rotations/auto`, {
		start_date: startDate || null,
		replace: !!opts.replace,
		first_lesson_id: opts.firstLessonId || null,
		carry_over: !!opts.carryOver,
	});
/** Tự xếp mọi hồ sơ GPHN của khóa chưa có vòng. */
export const autoArrangeCourse = (courseId: string) =>
	apiClient.post<{ arranged: number; failed: string[] }>(`/courses/${courseId}/practice/auto-arrange`, {});
export const scheduleRotations = (enrollmentId: string, startDate: string) =>
	apiClient.post<{ scheduled: number; skipped: number }>(`/courses/enrollments/${enrollmentId}/rotations/schedule`, {
		start_date: startDate,
	});
export const addRotationSegment = (enrollmentId: string, lessonId: string) =>
	apiClient.post<null>(`/courses/enrollments/${enrollmentId}/rotations/segment`, { lesson_id: lessonId });
export const updateRotation = (rotationId: string, data: RotationUpdate) =>
	apiClient.put<null>(`/courses/rotations/${rotationId}`, data);
export const refreshRotationMentor = (rotationId: string) =>
	apiClient.post<null>(`/courses/rotations/${rotationId}/refresh-mentor`, {});
export const retakeRotation = (rotationId: string) =>
	apiClient.post<null>(`/courses/rotations/${rotationId}/retake`, {});
export const moveRotation = (rotationId: string, direction: 'up' | 'down') =>
	apiClient.post<null>(`/courses/rotations/${rotationId}/move`, { direction });
export const removeRotation = (rotationId: string) => apiClient.delete<null>(`/courses/rotations/${rotationId}`);
// ─── Sổ thực hành GPHN (Excel mẫu 3.xlsx) ─────────────────────────────────
/** Thực hành GPHN đang diễn ra vào 1 ngày — theo khoa / người hướng dẫn. */
export const getPracticeBoard = (date: string) =>
	apiClient.get<PracticeBoard>(`/courses/practice-board?${new URLSearchParams({ date }).toString()}`);

export interface PracticeBookImportResult {
	dry_run: boolean;
	summary: {
		records: number;
		records_new: number;
		records_update: number;
		skipped: number;
		trainees_new: number;
		trainees_update: number;
		rotations: number;
		mentors_linked: number;
		programs: Record<string, number>;
		/** Hồ sơ chưa có khoa trong sổ — sẽ tự xếp vòng / khoa / NHD sau khi nhập. */
		auto_arrange: number;
	};
	rows?: {
		row: number;
		practice_code: string;
		full_name: string;
		action: 'new' | 'update';
		trainee_action: 'new' | 'update' | 'duplicate';
		program_code: string | null;
		program_found: boolean;
		rotations: number;
		auto: boolean;
		departments: string;
	}[];
	written?: number;
	trainees_inserted?: number;
	trainees_updated?: number;
	programs_linked?: number;
	/** Chương trình vừa được tạo mẫu vòng từ sổ. */
	templates?: { program_code: string; rounds: number }[];
	arranged?: number;
	warnings: string[];
}
export const importPracticeBook = (courseId: string, file: File, dryRun: boolean) => {
	const form = new FormData();
	form.append('file', file);
	form.append('dry_run', dryRun ? '1' : '0');
	return apiClient.postForm<PracticeBookImportResult>(`/courses/${courseId}/practice-book/import`, form);
};
export const exportPracticeBook = (courseId: string) =>
	apiClient.postBlob(`/courses/${courseId}/practice-book/export`, {});

// ─── Giấy tờ thực hành (Đơn đề nghị, Hợp đồng, Phiếu nhận xét) ────────────
export type PracticeDocumentType = 'don-de-nghi' | 'hop-dong' | 'phieu-nhan-xet';
export interface PracticeDocumentInfo {
	documents: { type: PracticeDocumentType; label: string; per_rotation: boolean; missing: string[] }[];
	rotations: { id: string; label: string; missing: string[] }[];
}
export const getPracticeDocuments = (enrollmentId: string) =>
	apiClient.get<PracticeDocumentInfo>(`/courses/enrollments/${enrollmentId}/documents`);
/** .docx; phiếu nhận xét không chọn vòng ⇒ .zip gồm phiếu mọi vòng. */
export const downloadPracticeDocument = (enrollmentId: string, type: PracticeDocumentType, rotationId?: string) =>
	apiClient.postBlob(`/courses/enrollments/${enrollmentId}/documents`, { type, rotation_id: rotationId ?? null });

export const searchMentors = (search: string, departmentId?: string) => {
	const qs = new URLSearchParams({ search, limit: '15' });
	if (departmentId) qs.set('department_id', departmentId);
	return apiClient.get<MentorOption[]>(`/staff-licenses/mentors?${qs}`);
};

export const decideEnrollment = (enrollmentId: string, status: EnrollmentStatus, note?: string) =>
	apiClient.put<RegisterResult>(`/courses/enrollments/${enrollmentId}/decide`, { status, note });
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
/** Bài học thuộc các chương trình của khóa (dòng của bảng Bài học × Giảng viên) */
export const getCourseLessons = (courseId: string) =>
	apiClient.get<CourseLesson[]>(`/courses/${courseId}/lessons`);
export const setLessonLecturers = (courseId: string, lessonId: string, data: LessonLecturersInput) =>
	apiClient.put<null>(`/courses/${courseId}/lesson-lecturers`, { ...data, lesson_id: lessonId });

// ─── Class sessions ───────────────────────────────────────────────────────
export const getSessions = (courseId: string) =>
	apiClient.get<ClassSession[]>(`/courses/${courseId}/sessions`);
export const createSession = (
	courseId: string,
	data: {
		subject_id?: string;
		lecturer_id?: string;
		session_date: string;
		start_time?: string;
		end_time?: string;
		room?: string;
		session_kind?: SessionKind;
	},
) => apiClient.post<{ id: string; warnings: string[] }>(`/courses/${courseId}/sessions`, data);
export const updateSession = (
	sessionId: string,
	data: {
		subject_id?: string;
		lecturer_id?: string;
		session_date?: string;
		start_time?: string;
		end_time?: string;
		room?: string;
		session_kind?: SessionKind | '';
	},
) => apiClient.put<{ warnings: string[] }>(`/courses/sessions/${sessionId}`, data);
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
		session_kind?: SessionKind;
	},
) => apiClient.post<{ created: number; skipped: number; warnings: string[] }>(`/courses/${courseId}/sessions/bulk`, data);

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

// Bảng điểm Lý thuyết + Thực hành (giai đoạn 4)
export const getGradebook = (courseId: string) => apiClient.get<Gradebook>(`/courses/${courseId}/gradebook`);
export const saveGradesBulk = (courseId: string, rows: GradeBulkRow[], source?: 'import') =>
	apiClient.put<{ saved: number }>(`/courses/${courseId}/grades/bulk`, { rows, source });
export const lockGrades = (courseId: string) => apiClient.post<Gradebook>(`/courses/${courseId}/grades/lock`, {});
export const unlockGrades = (courseId: string, reason?: string) =>
	apiClient.post<Gradebook>(`/courses/${courseId}/grades/unlock`, { reason: reason || null });
export const retakeGrade = (enrollmentId: string, part: GradePart) =>
	apiClient.post<null>(`/courses/enrollments/${enrollmentId}/grades/retake`, { part });
export const getGradeHistory = (enrollmentId: string) =>
	apiClient.get<GradeHistoryItem[]>(`/courses/enrollments/${enrollmentId}/grades/history`);
export const issueCertificatesBulk = (courseId: string, expiryDate?: string) =>
	apiClient.post<{ issued: number }>(`/courses/${courseId}/certificates/bulk`, { expiry_date: expiryDate || null });

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

/** Người chờ từ đợt trước (nội viện, cùng chương trình) — gợi ý ở tab Học viên của đợt mới. */
export interface WaitlistCandidate {
	id: string;
	trainee_id: string;
	trainee_name: string;
	trainee_phone: string | null;
	trainee_email: string | null;
	from_course_id: string;
	from_course_name: string;
	decided_at: string | null;
	waitlist_position: number;
}
export interface WaitlistClass {
	program_id: string;
	program_code: string | null;
	program_name: string;
	started: boolean;
	/** Chỗ trống của lớp — null = không giới hạn */
	room: number | null;
	candidates: WaitlistCandidate[];
}
export const getWaitlistCandidates = (courseId: string) =>
	apiClient.get<WaitlistClass[]>(`/courses/${courseId}/waitlist-candidates`);
export const transferWaitlisted = (courseId: string, enrollmentIds: string[]) =>
	apiClient.post<{ moved: number; skipped: number; full: number }>(`/courses/${courseId}/waitlist-transfer`, {
		enrollment_ids: enrollmentIds,
	});
