import { apiClient } from '../../../shared/api/axios';
import type { CourseDisplayStatus, DocType, EnrollmentStatus, ExamType, ProgressStatus, RotationResult, SourceType } from '../../course/types/course.type';
import type { AvailablePaper } from '../../exam/types/exam.type';
import type { CmeStatus, ParticipationType, SeminarEventType, SeminarScope } from '../../seminar/types/seminar.type';
import type { PublicCourse } from '../../public/api/publicApi';
import type { CmeSourceType } from '../../seminar/types/cmeRecord.type';

interface MyCourseBase {
	id: string;
	name: string;
	start_date: string | null;
	end_date: string | null;
	display_status: CourseDisplayStatus;
	session_count: number;
}

export interface MyGrade {
	subject_name: string | null;
	/** Điểm lý thuyết / thực hành thang 10 (giai đoạn 4); TX/GK/CK chỉ còn ở dữ liệu cũ */
	theory_score: number | null;
	practice_score: number | null;
	theory_flag: 'absent' | 'exempt' | null;
	practice_flag: 'absent' | 'exempt' | null;
	regular_score: number | null;
	midterm_score: number | null;
	final_score: number | null;
	score: number | null;
	result: string | null;
	classification: string | null;
}

export interface MyEnrolledCourse extends MyCourseBase {
	enrollment_id: string;
	enrollment_status: EnrollmentStatus;
	registered_at: string;
	program_name: string | null;
	cert_no: string | null;
	cert_issue_date: string | null;
	cert_status: 'active' | 'revoked' | null;
	attended_count: number;
	document_count: number;
	open_exam_count: number;
	/** Đang ở danh sách chờ của chương trình (lớp đầy) — vị trí, 1 = đầu hàng. */
	waitlist_position: number | null;
	grades: MyGrade[];
}

export interface MyTeachingCourse extends MyCourseBase {
	subjects: string | null;
	approved_count: number;
}

/** "Bài tôi dạy": 1 dòng = 1 bài được phân công trong 1 khóa */
export interface MyTeachingLesson {
	id: string;
	course_id: string;
	course_name: string;
	start_date: string | null;
	end_date: string | null;
	lesson_code: string | null;
	lesson_title: string;
	role: 'main' | 'assistant';
	hours: number | null;
	session_count: number;
}

export interface MySession {
	id: string;
	course_id: string;
	course_name: string;
	subject_name: string | null;
	lecturer_name: string | null;
	session_date: string;
	start_time: string | null;
	end_time: string | null;
	room: string | null;
	my_role: 'learning' | 'teaching';
}

/** Khóa đang mở đăng ký — cùng dữ liệu với cổng công khai */
export type OpenCourse = PublicCourse;

export interface MyTraining {
	enrolled: MyEnrolledCourse[];
	teaching: MyTeachingCourse[];
	teaching_lessons: MyTeachingLesson[];
	upcoming_sessions: MySession[];
	open_courses: OpenCourse[];
}

export interface MyCmeSeminar {
	id: string;
	seminar_id: string;
	seminar_title: string;
	event_type: SeminarEventType;
	scope: SeminarScope;
	location: string | null;
	start_date: string | null;
	end_date: string | null;
	date_text: string | null;
	participation_type: ParticipationType;
	cme_year: number | null;
	cme_certificate_no: string | null;
	cme_credits: number | null;
	cme_status: CmeStatus;
}

export type CmeApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface MyCmeRecord {
	id: string;
	title: string;
	activity_date: string | null;
	end_date: string | null;
	year: number;
	role: string | null;
	quantity: number | null;
	credits: number;
	note: string | null;
	category_id: string | null;
	category_name: string | null;
	approval_status: CmeApprovalStatus;
	reject_reason: string | null;
	/** Dòng tự động từ khóa học — không tự sửa / xoá */
	source_type: CmeSourceType | null;
	evidence_file_name: string | null;
	evidence_file_url: string | null;
	/** File bổ sung chứng minh kết quả — tải lên sau khi đã duyệt. */
	result_files: CmeResultFile[];
}

export interface CmeResultFile {
	id: string;
	file_name: string;
	file_url: string;
	created_at: string;
}

export interface MyCmeCategory {
	id: string;
	name: string;
	group_name: string | null;
	conversion_method: 'per_session' | 'fixed' | 'per_year' | null;
	conversion_value: number | null;
	unit_label: string | null;
}

export interface MyCme {
	/** null = toàn bộ các năm */
	year: number | null;
	required_credits: number | null;
	earned_credits: number;
	seminars: MyCmeSeminar[];
	records: MyCmeRecord[];
}

export interface MyCourseDocument {
	id: string;
	doc_type: DocType;
	title: string;
	exam_type: ExamType | null;
	source_type: SourceType;
	external_url: string | null;
	created_at: string;
	file_name: string | null;
	file_url: string | null;
	file_size: number | null;
}

export interface MyLessonDocument {
	id: string;
	lesson_id: string;
	title: string;
	source_type: SourceType;
	external_url: string | null;
	created_at: string;
	file_name: string | null;
	file_url: string | null;
	file_size: number | null;
}

export interface MyLesson {
	program_id: string;
	program_name: string;
	id: string;
	code: string;
	title: string;
	description: string | null;
	theory_hours: number;
	practice_hours: number;
	total_hours: number;
	credits: number;
	documents: MyLessonDocument[];
}

/** Vòng thực hành GPHN của hồ sơ mình (khóa mở liên tục) — tab "Thực hành" */
export interface MyRotation {
	id: string;
	round_title: string | null;
	seq: number;
	attempt_no: number;
	start_date: string | null;
	end_date: string | null;
	duration_text: string | null;
	department_name: string | null;
	mentor_salutation: string | null;
	mentor_name: string | null;
	mentor_qualification: string | null;
	mentor_phone: string | null;
	result: RotationResult;
	result_comment: string | null;
	result_at: string | null;
	/** unscheduled: chưa xếp lịch · current · awaiting: đã xong chờ đánh giá · upcoming · done */
	phase: 'unscheduled' | 'current' | 'awaiting' | 'upcoming' | 'done';
}

export interface MyCourseDetail {
	id: string;
	name: string;
	description: string | null;
	start_date: string | null;
	end_date: string | null;
	display_status: CourseDisplayStatus;
	enrollment_status: EnrollmentStatus;
	/** Số buổi của lớp mình / số buổi có mặt (kể cả muộn) */
	session_count: number;
	attended_count: number;
	documents: MyCourseDocument[];
	lessons: MyLesson[];
	papers: AvailablePaper[];
	/** Khóa mở liên tục (thực hành GPHN) — hiện tab "Thực hành" thay "Bài học" */
	is_rolling: boolean;
	enrollment_id: string;
	practice_code: string | null;
	program_name: string | null;
	professional_field: string | null;
	practice_form: string | null;
	sending_unit: string | null;
	total_duration: string | null;
	practice_start: string | null;
	practice_end: string | null;
	progress_status: ProgressStatus | null;
	rotations: MyRotation[];
}

export const getMyCourse = (id: string) => apiClient.get<MyCourseDetail>(`/me/courses/${id}`);
export const markDocumentOpened = (docId: string, kind: 'course' | 'lesson' = 'course') =>
	apiClient.patch(`/me/${kind === 'lesson' ? 'lesson-documents' : 'documents'}/${docId}/download`, {});
export const getMyTraining = () => apiClient.get<MyTraining>('/me/training');
export const registerMyCourse = (courseId: string, programId?: string) =>
	apiClient.post(`/me/courses/${courseId}/register`, { program_id: programId || null });
export const getMyCme = (year: number | 'all') => apiClient.get<MyCme>(`/me/cme?year=${year}`);
/** Phiếu theo dõi CME cá nhân (Excel): năm được chọn + tổng hợp 5 năm. */
export const exportMyCmeExcel = (year: number) => apiClient.postBlob('/me/cme/export-excel', { year });

export interface MyCmeRecordForm {
	category_id: string;
	title: string;
	activity_date: string;
	end_date: string;
	year: string;
	role: string;
	quantity: string;
	note: string;
}

// Không gửi tín chỉ — người quản lý nhập khi duyệt
const toPayload = (f: MyCmeRecordForm) => ({
	category_id: f.category_id || null,
	title: f.title,
	activity_date: f.activity_date || null,
	end_date: f.end_date || null,
	year: Number(f.year) || null,
	role: f.role || null,
	quantity: f.quantity === '' ? null : Number(f.quantity),
	note: f.note || null,
});

export const getMyCmeCategories = () => apiClient.get<MyCmeCategory[]>('/me/cme-categories');
export const createMyCmeRecord = (f: MyCmeRecordForm) => apiClient.post<{ id: string }>('/me/cme-records', toPayload(f));
export const updateMyCmeRecord = (id: string, f: MyCmeRecordForm) =>
	apiClient.put<{ id: string }>(`/me/cme-records/${id}`, toPayload(f));
export const deleteMyCmeRecord = (id: string) => apiClient.delete<null>(`/me/cme-records/${id}`);
export const addMyCmeEvidence = (id: string, file: File) => {
	const form = new FormData();
	form.append('file', file);
	return apiClient.postForm<{ id: string }>(`/me/cme-records/${id}/evidence`, form);
};
export const addMyCmeResultFile = (id: string, file: File) => {
	const form = new FormData();
	form.append('file', file);
	return apiClient.postForm<MyCmeRecord>(`/me/cme-records/${id}/result-files`, form);
};
export const deleteMyCmeResultFile = (id: string, fileId: string) =>
	apiClient.delete<null>(`/me/cme-records/${id}/result-files/${fileId}`);

// ─── Điểm danh học viên theo ca, trong thời gian khóa học (IP bệnh viện + GPS) ──
export interface AttendanceRow {
	id: number;
	/** Ngày bắt đầu ca. */
	work_date: string;
	/** Khóa đang học lúc điểm danh (bản chụp). */
	course_id: string | null;
	course_name: string | null;
	/** null = điểm danh tự do (không có lịch ca). */
	shift_id: number | null;
	shift_name: string | null;
	shift_code: string | null;
	shift_start_at: string | null;
	shift_end_at: string | null;
	check_in_at: string;
	check_in_distance_m: number | null;
	check_out_at: string | null;
	check_out_distance_m: number | null;
	late_min: number | null;
	early_min: number | null;
}
/** Một lần làm ca (ca × ngày bắt đầu). Trường ca null = điểm danh tự do. */
export interface ShiftSlot {
	shift_id: number | null;
	work_date: string;
	name: string | null;
	code: string | null;
	color: string | null;
	start_time: string | null;
	end_time: string | null;
	start_at: string | null;
	end_at: string | null;
}
export interface CheckOption extends ShiftSlot {
	action: 'check_in' | 'check_out';
	course_id: string | null;
	course_name: string | null;
}
export interface MyAttendance {
	/** Tài khoản đang đăng nhập là tài khoản học viên — chỉ học viên mới điểm danh. */
	is_trainee: boolean;
	/** Ca đang trong giờ được điểm danh (thường 0–1, có thể 2 lúc giao ca). */
	options: CheckOption[];
	/** Bản ghi của hôm qua + hôm nay (ca đêm hôm qua vẫn hiện). */
	recent: AttendanceRow[];
	history: AttendanceRow[];
	/**
	 * Lịch ca 7 ngày tới. course_id null = không học khóa nào (không điểm danh);
	 * shifts null = không có lịch ca (điểm danh tự do), [] = nghỉ.
	 */
	week: {
		date: string;
		course_id: string | null;
		course_name: string | null;
		source: 'roster' | 'pattern' | null;
		shifts: ShiftSlot[] | null;
	}[];
	/** Khóa đang học hôm nay + mẫu ca tuần của khóa. */
	current_course: { course_id: string; course_name: string; pattern_name: string | null } | null;
	client_ip: string | null;
	/** IP hiện tại có thuộc mạng bệnh viện không. */
	ip_ok: boolean;
	/** Quản trị đã cấu hình đủ IP + vị trí bệnh viện chưa. */
	configured: boolean;
	radius_m: number;
	/** Giới hạn đơn xin phép — Cấu hình hệ thống → Điểm danh → Đơn xin phép. */
	leave: LeavePolicy;
}
export interface LeavePolicy {
	/** false = quản trị tắt gửi đơn mới. */
	enabled: boolean;
	/** Nộp bổ sung cho ngày đã qua tối đa N ngày (0 = không cho). */
	backdate_days: number;
	/** Xin phép trước tối đa N ngày. */
	ahead_days: number;
	/** Một đơn xin nghỉ dài tối đa N ngày. */
	max_span_days: number;
}
export const getMyAttendance = () => apiClient.get<MyAttendance>('/me/attendance');
export const checkAttendance = (data: {
	lat: number;
	lng: number;
	accuracy: number;
	/** Ca cần điểm danh — bắt buộc khi có nhiều ca mở cùng lúc. */
	shift_id?: number | null;
	work_date?: string;
}) => apiClient.post<{ action: 'check_in' | 'check_out'; record: AttendanceRow }>('/me/attendance/check', data);

// ─── Đơn xin nghỉ / xin đi muộn (học viên gửi, phòng Đào tạo / khoa duyệt) ──
export type LeaveType = 'absent' | 'late';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export interface LeaveRequest {
	id: number;
	user_id: string;
	type: LeaveType;
	from_date: string;
	/** = from_date với đơn xin đi muộn. */
	to_date: string;
	/** null = cả ngày. */
	shift_id: number | null;
	shift_name: string | null;
	/** Giờ dự kiến có mặt 'HH:mm' (đơn xin đi muộn). */
	arrive_time: string | null;
	reason: string;
	course_id: string | null;
	course_name: string | null;
	status: LeaveStatus;
	review_note: string | null;
	reviewer_name: string | null;
	reviewed_at: string | null;
	created_at: string;
}
export interface LeaveRequestForm {
	type: LeaveType;
	from_date: string;
	to_date?: string;
	shift_id?: number | null;
	arrive_time?: string | null;
	reason: string;
}
export const LEAVE_TYPE_TEXT: Record<LeaveType, string> = { absent: 'Xin nghỉ', late: 'Xin đi muộn' };
export const LEAVE_STATUS: Record<LeaveStatus, { label: string; tone: 'amber' | 'green' | 'red' | 'gray' }> = {
	pending: { label: 'Chờ duyệt', tone: 'amber' },
	approved: { label: 'Đã duyệt', tone: 'green' },
	rejected: { label: 'Từ chối', tone: 'red' },
	cancelled: { label: 'Đã huỷ', tone: 'gray' },
};
export const getMyLeaveRequests = () => apiClient.get<LeaveRequest[]>('/me/attendance/leave-requests');
export const createLeaveRequest = (data: LeaveRequestForm) =>
	apiClient.post<LeaveRequest>('/me/attendance/leave-requests', data);
export const cancelLeaveRequest = (id: number) =>
	apiClient.patch<null>(`/me/attendance/leave-requests/${id}/cancel`, {});
