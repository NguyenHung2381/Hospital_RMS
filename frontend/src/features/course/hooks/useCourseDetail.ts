import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../../shared/api/axios';
import { showToast } from '@/shared/utils/feedback';
import type { DocumentSource } from '../api/courseApi';
import {
	addDocument as apiAddDocument,
	assignLecturer as apiAssignLecturer,
	createSession as apiCreateSession,
	createSessionsBulk as apiCreateSessionsBulk,
	decideEnrollment as apiDecideEnrollment,
	getAssignments,
	getCourseLessons,
	getCertificates,
	getDocuments,
	getEnrollments,
	getGrades,
	getProgramLinks,
	getSessions,
	incrementDocumentDownload as apiIncrementDocumentDownload,
	issueCertificate as apiIssueCertificate,
	registerTrainee as apiRegisterTrainee,
	registerStaff as apiRegisterStaff,
	removeAssignment as apiRemoveAssignment,
	removeCertificate as apiRemoveCertificate,
	removeDocument as apiRemoveDocument,
	removeEnrollment as apiRemoveEnrollment,
	removeSession as apiRemoveSession,
	revokeCertificate as apiRevokeCertificate,
	setLessonLecturers as apiSetLessonLecturers,
	upsertGrade as apiUpsertGrade,
} from '../api/courseApi';
import type {
	Certificate,
	ClassSession,
	CourseDocument,
	CourseLesson,
	CourseProgramLink,
	DocType,
	Enrollment,
	EnrollmentStatus,
	Grade,
	LecturerAssignment,
	LessonLecturersInput,
} from '../types/course.type';

export interface SimpleItem {
	id: string;
	name: string;
}

/** Giảng viên: bác sĩ/nhân viên nội viện hoặc chuyên gia ngoài viện (GS/PGS/TS...). */
export interface LecturerItem extends SimpleItem {
	is_external: boolean;
}

interface PersonRow {
	id: string;
	full_name: string;
	phone?: string | null;
	specialty?: string | null;
	is_employee?: boolean | null;
}

interface LecturerRow extends PersonRow {
	is_external: boolean;
	academic_degree?: string | null;
	academic_rank?: string | null;
}

interface StaffCandidate {
	id: string;
	full_name: string;
	staff_number?: string | null;
	department_name?: string | null;
}

/** Tiền tố id cho nhân viên nội viện chưa có hồ sơ học viên trong danh sách chọn —
 * registerTrainee nhận ra để gửi `user_id` thay vì `trainee_id`. */
export const STAFF_OPTION_PREFIX = 'user:';

/** Cảnh báo trùng lịch giảng viên từ backend — không chặn, chỉ báo. */
const warnClashes = (warnings?: string[]) => {
	if (!warnings?.length) return;
	const more = warnings.length > 1 ? ` (và ${warnings.length - 1} buổi trùng khác)` : '';
	showToast('info', `Cảnh báo trùng lịch giảng viên: ${warnings[0]}${more}`);
};

const joinLabel = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');

// "PGS.TS Nguyễn Văn A · Tim mạch" — thêm học hàm/học vị trước tên nếu tên chưa ghi sẵn.
const toLecturerItem = (l: LecturerRow): LecturerItem => {
	const title = [l.academic_rank, l.academic_degree].filter(Boolean).join('.');
	const hasTitle = !title || /^(GS|PGS|TS|ThS|BS|CN|DS|ĐD)[.\s]/i.test(l.full_name.trim());
	return {
		id: l.id,
		name: joinLabel(hasTitle ? l.full_name : `${title} ${l.full_name}`, l.specialty),
		is_external: !!l.is_external,
	};
};

/** Các bước của trang chi tiết khóa học, theo đúng thứ tự công việc. */
export type DetailTab = 'enrollments' | 'sessions' | 'documents' | 'exams' | 'results';

export function useCourseDetail(courseId: string) {
	const [programLinks, setProgramLinks] = useState<CourseProgramLink[]>([]);
	const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
	const [assignments, setAssignments] = useState<LecturerAssignment[]>([]);
	const [sessions, setSessions] = useState<ClassSession[]>([]);
	const [documents, setDocuments] = useState<CourseDocument[]>([]);
	const [grades, setGrades] = useState<Grade[]>([]);
	const [certificates, setCertificates] = useState<Certificate[]>([]);
	const [trainees, setTrainees] = useState<SimpleItem[]>([]);
	const [lecturers, setLecturers] = useState<LecturerItem[]>([]);
	const [lessons, setLessons] = useState<SimpleItem[]>([]);
	const [courseLessons, setCourseLessons] = useState<CourseLesson[]>([]);
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
			getCourseLessons(courseId),
		])
			.then(([links, e, a, s, doc, g, c, cl]) => {
				setProgramLinks(links);
				setEnrollments(e);
				setAssignments(a);
				setSessions(s);
				setDocuments(doc);
				setGrades(g);
				setCertificates(c);
				setCourseLessons(cl);
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : 'Không thể tải chi tiết khóa học');
			})
			.finally(() => setLoading(false));
	}, [courseId]);

	useEffect(() => {
		load();
	}, [load]);

	// Ô "thêm học viên" gộp 2 nguồn: hồ sơ học viên (cả nội viện lẫn ngoại viện) +
	// nhân viên nội viện chưa có hồ sơ học viên (tạo tự động khi ghi danh).
	const loadEnrollCandidates = useCallback(() => {
		Promise.all([
			apiClient.get<{ data: PersonRow[] }>('/trainees?limit=0').then((r) => r.data),
			apiClient.get<StaffCandidate[]>('/courses/staff-candidates').catch(() => [] as StaffCandidate[]),
		])
			.then(([traineeRows, staff]) =>
				setTrainees([
					...traineeRows.map((t) => ({
						id: t.id,
						name: joinLabel(t.full_name, t.phone, t.is_employee ? 'Nội viện' : 'Ngoại viện'),
					})),
					...staff.map((u) => ({
						id: STAFF_OPTION_PREFIX + u.id,
						name: joinLabel(u.full_name, u.staff_number, u.department_name, 'Nội viện'),
					})),
				]),
			)
			.catch(() => {});
	}, []);

	useEffect(() => {
		// trainees/lecturers trả cột `full_name` (không có `name`) — quy về SimpleItem, kèm
		// SĐT/chuyên môn để phân biệt người trùng tên trong dropdown.
		loadEnrollCandidates();
		apiClient
			.get<{ data: LecturerRow[] }>('/lecturers?limit=0&active_only=true')
			.then((r) => setLecturers(r.data.map(toLecturerItem)))
			.catch(() => {});
		apiClient
			.get<{ id: string; code: string; title: string }[]>('/training-programs/lessons/all')
			.then((r) => setLessons(r.map((l) => ({ id: l.id, name: l.code ? `${l.code} — ${l.title}` : l.title }))))
			.catch(() => {});
	}, [loadEnrollCandidates]);

	const registerTrainee = useCallback(
		async (traineeId: string, programId?: string) => {
			setBusy(true);
			setError('');
			try {
				let out;
				if (traineeId.startsWith(STAFF_OPTION_PREFIX)) {
					out = await apiRegisterStaff(courseId, traineeId.slice(STAFF_OPTION_PREFIX.length), programId);
					// Nhân viên vừa được tạo hồ sơ học viên — nạp lại để không còn hiện 2 lần.
					loadEnrollCandidates();
				} else {
					out = await apiRegisterTrainee(courseId, traineeId, programId);
				}
				// Ghi danh hộ được duyệt luôn; khóa GPHN backend đã tự xếp vòng — chỉ báo khi chưa xếp được
				if (out.auto_warning) showToast('error', out.auto_warning);
				else if (out.batch_name) showToast('success', `Đã ghi danh và xếp vào ${out.batch_name}`);
				else if (out.waitlist_position != null)
					showToast('info', `Đã ghi danh — đang chờ đợt học (vị trí ${out.waitlist_position})`);
				else if (out.status === 'waitlisted') showToast('info', 'Khóa đã đủ sĩ số — học viên được đưa vào danh sách chờ');
				else showToast('success', 'Đã ghi danh và duyệt học viên');
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Đăng ký thất bại');
			} finally {
				setBusy(false);
			}
		},
		[courseId, load, loadEnrollCandidates],
	);

	const decideEnrollment = useCallback(
		async (enrollmentId: string, status: EnrollmentStatus, note?: string) => {
			setBusy(true);
			setError('');
			try {
				const out = await apiDecideEnrollment(enrollmentId, status, note);
				if (out.batch_name) showToast('success', `Đã duyệt và xếp vào ${out.batch_name}`);
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Cập nhật thất bại');
			} finally {
				setBusy(false);
			}
		},
		[load],
	);

	/** Duyệt/từ chối nhiều đăng ký. Gọi tuần tự để backend kiểm tra sĩ số theo đúng thứ tự;
	 *  lỗi ở một đăng ký không chặn các đăng ký còn lại. Trả về danh sách id xử lý thất bại. */
	const decideEnrollmentsBulk = useCallback(
		async (enrollmentIds: string[], status: EnrollmentStatus) => {
			setBusy(true);
			setError('');
			const failed: string[] = [];
			let firstError = '';
			for (const id of enrollmentIds) {
				try {
					await apiDecideEnrollment(id, status);
				} catch (err) {
					failed.push(id);
					if (!firstError) firstError = err instanceof Error ? err.message : 'Cập nhật thất bại';
				}
			}
			if (failed.length) {
				setError(`${failed.length}/${enrollmentIds.length} đăng ký không cập nhật được: ${firstError}`);
			}
			try {
				await load();
			} finally {
				setBusy(false);
			}
			return failed;
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

	/** Lưu 1 dòng của bảng Bài học × Giảng viên (GV chính + GV phụ + số tiết). */
	const setLessonLecturers = useCallback(
		async (lessonId: string, data: LessonLecturersInput) => {
			setBusy(true);
			setError('');
			try {
				await apiSetLessonLecturers(courseId, lessonId, data);
				setAssignments(await getAssignments(courseId));
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Lưu phân công thất bại');
			} finally {
				setBusy(false);
			}
		},
		[courseId],
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
				warnClashes((await apiCreateSession(courseId, data)).warnings);
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
				warnClashes(result.warnings);
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
			data: { doc_type: DocType; title: string; is_public: boolean },
		) => {
			setBusy(true);
			setError('');
			try {
				await apiAddDocument(courseId, source, data);
				await load();
				return true;
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Tải lên thất bại');
				return false;
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
		reload: load,
		programLinks,
		enrollments,
		assignments,
		sessions,
		documents,
		grades,
		certificates,
		trainees,
		lecturers,
		lessons,
		courseLessons,
		loading,
		busy,
		error,
		setError,
		attendanceSessionId,
		setAttendanceSessionId,
		registerTrainee,
		decideEnrollment,
		decideEnrollmentsBulk,
		removeEnrollment,
		assignLecturer,
		setLessonLecturers,
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
