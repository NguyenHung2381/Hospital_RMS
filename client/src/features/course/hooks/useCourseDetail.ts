import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../../shared/api/axios';
import {
	addDocument as apiAddDocument,
	assignLecturer as apiAssignLecturer,
	createSession as apiCreateSession,
	decideEnrollment as apiDecideEnrollment,
	getAssignments,
	getCertificates,
	getDocuments,
	getEnrollments,
	getGrades,
	getSessions,
	issueCertificate as apiIssueCertificate,
	registerTrainee as apiRegisterTrainee,
	removeAssignment as apiRemoveAssignment,
	removeCertificate as apiRemoveCertificate,
	removeDocument as apiRemoveDocument,
	removeEnrollment as apiRemoveEnrollment,
	removeSession as apiRemoveSession,
	upsertGrade as apiUpsertGrade,
} from '../api/courseApi';
import type {
	Certificate,
	ClassSession,
	CourseDocument,
	DocType,
	Enrollment,
	EnrollmentStatus,
	Grade,
	LecturerAssignment,
} from '../types/course.type';

export interface SimpleItem {
	id: string;
	name: string;
}

export type DetailTab = 'enrollments' | 'lecturers' | 'sessions' | 'documents' | 'results';

export function useCourseDetail(courseId: string) {
	const [tab, setTab] = useState<DetailTab>('enrollments');
	const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
	const [assignments, setAssignments] = useState<LecturerAssignment[]>([]);
	const [sessions, setSessions] = useState<ClassSession[]>([]);
	const [documents, setDocuments] = useState<CourseDocument[]>([]);
	const [grades, setGrades] = useState<Grade[]>([]);
	const [certificates, setCertificates] = useState<Certificate[]>([]);
	const [trainees, setTrainees] = useState<SimpleItem[]>([]);
	const [lecturers, setLecturers] = useState<SimpleItem[]>([]);
	const [subjects, setSubjects] = useState<SimpleItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [attendanceSessionId, setAttendanceSessionId] = useState<string | null>(null);

const load = useCallback(async () => {
		setLoading(true);
		try {
			const [e, a, s, doc, g, c] = await Promise.all([
				getEnrollments(courseId),
				getAssignments(courseId),
				getSessions(courseId),
				getDocuments(courseId),
				getGrades(courseId),
				getCertificates(courseId),
			]);
			setEnrollments(e);
			setAssignments(a);
			setSessions(s);
			setDocuments(doc);
			setGrades(g);
			setCertificates(c);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Không thể tải chi tiết khóa học');
		} finally {
			setLoading(false);
		}
	}, [courseId]);

	useEffect(() => {
		load();
	}, [load]);

	useEffect(() => {
		apiClient.get<{ data: SimpleItem[] }>('/trainees?limit=0').then((r) => setTrainees(r.data)).catch(() => {});
		apiClient.get<{ data: SimpleItem[] }>('/lecturers?limit=0&active_only=true').then((r) => setLecturers(r.data)).catch(() => {});
		apiClient.get<{ data: SimpleItem[] }>('/subjects?limit=0').then((r) => setSubjects(r.data)).catch(() => {});
	}, []);

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

	const addDocument = useCallback(
		async (file: File, data: { doc_type: DocType; title: string; is_public: boolean }) => {
			setBusy(true);
			setError('');
			try {
				await apiAddDocument(courseId, file, data);
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

	const upsertGrade = useCallback(
		async (data: { enrollment_id: string; subject_id?: string; score?: number; result?: string; note?: string }) => {
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
		async (enrollmentId: string) => {
			setBusy(true);
			setError('');
			try {
				await apiIssueCertificate(enrollmentId);
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
		registerTrainee,
		decideEnrollment,
		removeEnrollment,
		assignLecturer,
		removeAssignment,
		createSession,
		removeSession,
		addDocument,
		removeDocument,
		upsertGrade,
		issueCertificate,
		removeCertificate,
	};
}
