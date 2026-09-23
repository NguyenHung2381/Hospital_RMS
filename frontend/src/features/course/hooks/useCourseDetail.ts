import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../../shared/api/axios';
import type { DocumentSource } from '../api/courseApi';
import {
	addDocument as apiAddDocument,
	addProgramLink as apiAddProgramLink,
	assignLecturer as apiAssignLecturer,
	createSession as apiCreateSession,
	createSessionsBulk as apiCreateSessionsBulk,
	decideEnrollment as apiDecideEnrollment,
	getAssignments,
	getCertificates,
	getDocuments,
	getEnrollments,
	getGrades,
	getProgramLinks,
	getSessions,
	incrementDocumentDownload as apiIncrementDocumentDownload,
	issueCertificate as apiIssueCertificate,
	registerTrainee as apiRegisterTrainee,
	removeAssignment as apiRemoveAssignment,
	removeCertificate as apiRemoveCertificate,
	removeDocument as apiRemoveDocument,
	removeEnrollment as apiRemoveEnrollment,
	removeProgramLink as apiRemoveProgramLink,
	removeSession as apiRemoveSession,
	revokeCertificate as apiRevokeCertificate,
	updateProgramLink as apiUpdateProgramLink,
	upsertGrade as apiUpsertGrade,
} from '../api/courseApi';
import type {
	Certificate,
	ClassSession,
	CourseDocument,
	CourseProgramLink,
	CourseProgramLinkFormData,
	DocType,
	Enrollment,
	EnrollmentStatus,
	ExamType,
	Grade,
	LecturerAssignment,
} from '../types/course.type';

export interface SimpleItem {
	id: string;
	name: string;
}

export type DetailTab = 'programs' | 'enrollments' | 'lecturers' | 'sessions' | 'documents' | 'results';

export function useCourseDetail(courseId: string) {
	const [tab, setTab] = useState<DetailTab>('enrollments');
	const [programLinks, setProgramLinks] = useState<CourseProgramLink[]>([]);
	const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
	const [assignments, setAssignments] = useState<LecturerAssignment[]>([]);
	const [sessions, setSessions] = useState<ClassSession[]>([]);
	const [documents, setDocuments] = useState<CourseDocument[]>([]);
	const [grades, setGrades] = useState<Grade[]>([]);
	const [certificates, setCertificates] = useState<Certificate[]>([]);
	const [trainees, setTrainees] = useState<SimpleItem[]>([]);
	const [lecturers, setLecturers] = useState<SimpleItem[]>([]);
	const [subjects, setSubjects] = useState<SimpleItem[]>([]);
	const [programs, setPrograms] = useState<SimpleItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [attendanceSessionId, setAttendanceSessionId] = useState<string | null>(null);

const load = useCallback(() => {
		return Promise.all([
			getProgramLinks(courseId),
			getEnrollments(courseId),
			getAssignments(courseId),
			getSessions(courseId),
			getDocuments(courseId),
			getGrades(courseId),
			getCertificates(courseId),
		])
			.then(([links, e, a, s, doc, g, c]) => {
				setProgramLinks(links);
				setEnrollments(e);
				setAssignments(a);
				setSessions(s);
				setDocuments(doc);
				setGrades(g);
				setCertificates(c);
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : 'Không thể tải chi tiết khóa học');
			})
			.finally(() => setLoading(false));
	}, [courseId]);

	useEffect(() => {
		load();
	}, [load]);

	useEffect(() => {
		apiClient.get<{ data: SimpleItem[] }>('/trainees?limit=0').then((r) => setTrainees(r.data)).catch(() => {});
		apiClient.get<{ data: SimpleItem[] }>('/lecturers?limit=0&active_only=true').then((r) => setLecturers(r.data)).catch(() => {});
		apiClient.get<{ data: SimpleItem[] }>('/subjects?limit=0').then((r) => setSubjects(r.data)).catch(() => {});
		apiClient.get<{ data: SimpleItem[] }>('/training-programs?limit=0').then((r) => setPrograms(r.data)).catch(() => {});
	}, []);

	const addProgramLink = useCallback(
		async (data: CourseProgramLinkFormData) => {
			setBusy(true);
			setError('');
			try {
				await apiAddProgramLink(courseId, data);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Gán chương trình thất bại');
			} finally {
				setBusy(false);
			}
		},
		[courseId, load],
	);

	const updateProgramLink = useCallback(
		async (linkId: string, data: Partial<CourseProgramLinkFormData>) => {
			setBusy(true);
			setError('');
			try {
				await apiUpdateProgramLink(linkId, data);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Cập nhật thất bại');
			} finally {
				setBusy(false);
			}
		},
		[load],
	);

	const removeProgramLink = useCallback(
		async (linkId: string) => {
			setBusy(true);
			try {
				await apiRemoveProgramLink(linkId);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Gỡ thất bại');
			} finally {
				setBusy(false);
			}
		},
		[load],
	);

	const registerTrainee = useCallback(
		async (traineeId: string) => {
			setBusy(true);
			setError('');
			try {
				await apiRegisterTrainee(courseId, traineeId);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Đăng ký thất bại');
			} finally {
				setBusy(false);
			}
		},
		[courseId, load],
	);

	const decideEnrollment = useCallback(
		async (enrollmentId: string, status: EnrollmentStatus, note?: string) => {
			setBusy(true);
			setError('');
			try {
				await apiDecideEnrollment(enrollmentId, status, note);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Cập nhật thất bại');
			} finally {
				setBusy(false);
			}
		},
		[load],
	);

	const removeEnrollment = useCallback(
		async (enrollmentId: string) => {
			setBusy(true);
			try {
				await apiRemoveEnrollment(enrollmentId);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Xoá thất bại');
			} finally {
				setBusy(false);
			}
		},
		[load],
	);

	const assignLecturer = useCallback(
		async (data: { lecturer_id: string; subject_id?: string; note?: string }) => {
			setBusy(true);
			setError('');
			try {
				await apiAssignLecturer(courseId, data);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Phân công thất bại');
			} finally {
				setBusy(false);
			}
		},
		[courseId, load],
	);

	const removeAssignment = useCallback(
		async (assignmentId: string) => {
			setBusy(true);
			try {
				await apiRemoveAssignment(assignmentId);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Xoá thất bại');
			} finally {
				setBusy(false);
			}
		},
		[load],
	);

	const createSession = useCallback(
		async (data: {
			subject_id?: string;
			lecturer_id?: string;
			session_date: string;
			start_time?: string;
			end_time?: string;
			room?: string;
		}) => {
			setBusy(true);
			setError('');
			try {
				await apiCreateSession(courseId, data);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Thêm buổi học thất bại');
			} finally {
				setBusy(false);
			}
		},
		[courseId, load],
	);

	const removeSession = useCallback(
		async (sessionId: string) => {
			setBusy(true);
			try {
				await apiRemoveSession(sessionId);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Xoá thất bại');
			} finally {
				setBusy(false);
			}
		},
		[load],
	);

	const createSessionsBulk = useCallback(
		async (data: {
			start_date: string;
			end_date: string;
			weekdays: number[];
			start_time?: string;
			end_time?: string;
			room?: string;
			lecturer_id?: string;
			subject_id?: string;
		}) => {
			setBusy(true);
			setError('');
			try {
				const result = await apiCreateSessionsBulk(courseId, data);
				await load();
				return result;
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Tạo lịch hàng loạt thất bại');
				return null;
			} finally {
				setBusy(false);
			}
		},
		[courseId, load],
	);

	const addDocument = useCallback(
		async (
			source: DocumentSource,
			data: { doc_type: DocType; title: string; is_public: boolean; exam_type?: ExamType | '' },
		) => {
			setBusy(true);
			setError('');
			try {
				await apiAddDocument(courseId, source, data);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Tải lên thất bại');
			} finally {
				setBusy(false);
			}
		},
		[courseId, load],
	);

	const removeDocument = useCallback(
		async (docId: string) => {
			setBusy(true);
			try {
				await apiRemoveDocument(docId);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Xoá thất bại');
			} finally {
				setBusy(false);
			}
		},
		[load],
	);

	const incrementDocumentDownload = useCallback((docId: string) => {
		apiIncrementDocumentDownload(docId).catch(() => {});
		setDocuments((prev) => prev.map((d) => (d.id === docId ? { ...d, download_count: d.download_count + 1 } : d)));
	}, []);

	const upsertGrade = useCallback(
		async (data: {
			enrollment_id: string;
			subject_id?: string;
			program_id?: string;
			score?: number;
			result?: string;
			regular_score?: number;
			midterm_score?: number;
			final_score?: number;
			note?: string;
		}) => {
			setBusy(true);
			setError('');
			try {
				await apiUpsertGrade(data);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Lưu kết quả thất bại');
			} finally {
				setBusy(false);
			}
		},
		[load],
	);

	const issueCertificate = useCallback(
		async (enrollmentId: string, expiryDate?: string) => {
			setBusy(true);
			setError('');
			try {
				await apiIssueCertificate(enrollmentId, expiryDate);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Cấp chứng chỉ thất bại');
			} finally {
				setBusy(false);
			}
		},
		[load],
	);

	const removeCertificate = useCallback(
		async (certId: string) => {
			setBusy(true);
			try {
				await apiRemoveCertificate(certId);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Xoá thất bại');
			} finally {
				setBusy(false);
			}
		},
		[load],
	);

	const revokeCertificate = useCallback(
		async (certId: string, reason?: string) => {
			setBusy(true);
			try {
				await apiRevokeCertificate(certId, reason);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Thu hồi thất bại');
			} finally {
				setBusy(false);
			}
		},
		[load],
	);

	return {
		tab,
		setTab,
		programLinks,
		programs,
		enrollments,
		assignments,
		sessions,
		documents,
		grades,
		certificates,
		trainees,
		lecturers,
		subjects,
		loading,
		busy,
		error,
		setError,
		attendanceSessionId,
		setAttendanceSessionId,
		addProgramLink,
		updateProgramLink,
		removeProgramLink,
		registerTrainee,
		decideEnrollment,
		removeEnrollment,
		assignLecturer,
		removeAssignment,
		createSession,
		createSessionsBulk,
		removeSession,
		addDocument,
		removeDocument,
		incrementDocumentDownload,
		upsertGrade,
		issueCertificate,
		removeCertificate,
		revokeCertificate,
	};
}
