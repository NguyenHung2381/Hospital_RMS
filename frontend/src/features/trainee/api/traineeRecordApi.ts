import { apiClient } from '../../../shared/api/axios';
import type { MyCme } from '../../portal/api/meApi';
import type { ClassCalendarResponse } from '../../class-schedule/types/classSchedule.type';
import type { CertificateStatus, GradeFlag, GradePart, GradebookRow } from '../../course/types/course.type';

// Hồ sơ học viên đầy đủ (giai đoạn 3) — backend training/trainees/traineeRecordService.js

export type TraineeDocStatus = 'approved' | 'pending' | 'rejected';

export interface ChecklistDocument {
	id: string;
	doc_type: string;
	status: TraineeDocStatus;
	review_note: string | null;
	created_at: string;
	reviewed_at: string | null;
	reviewed_by_name: string | null;
	file_name: string;
	file_url: string;
	mime_type: string | null;
	file_size: number | null;
}

export interface DocumentChecklist {
	items: {
		id: string;
		name: string;
		/** Bắt buộc theo loại khóa học viên đã ghi danh */
		required: boolean;
		state: 'done' | 'pending' | 'missing';
		documents: ChecklistDocument[];
	}[];
	required_total: number;
	required_done: number;
}

interface AttendanceSummary {
	total: number;
	present: number;
	late: number;
	absent: number;
	unmarked: number;
}

export interface TraineeAttendanceCourse {
	enrollment_id: string;
	course_id: string;
	course_name: string;
	training_type_id: string | null;
	training_type_name: string | null;
	/** Chương trình của lượt ghi danh — phân biệt khi 1 khóa ghi danh nhiều chương trình */
	program_code: string | null;
	program_name: string | null;
	start_date: string | null;
	end_date: string | null;
	theory: AttendanceSummary;
	practice: AttendanceSummary;
	sessions: {
		session_id: string;
		session_date: string;
		start_time: string | null;
		end_time: string | null;
		lesson_title: string | null;
		kind: GradePart;
		status: 'present' | 'absent' | 'late' | null;
		method: string | null;
		note: string | null;
	}[];
	rotations: TraineeRotation[];
}

export interface TraineeRotation {
	id?: string;
	seq: number;
	round_title: string | null;
	department_name: string | null;
	start_date?: string | null;
	end_date?: string | null;
	mentor_name?: string | null;
	result: 'pending' | 'pass' | 'fail' | string;
	attempt_no: number;
}

export interface TraineeCourseResult {
	enrollment_id: string;
	course_id: string;
	course_name: string;
	training_type_id: string | null;
	training_type_name: string | null;
	/** Chương trình của lượt ghi danh — phân biệt khi 1 khóa ghi danh nhiều chương trình */
	program_code: string | null;
	program_name: string | null;
	start_date: string | null;
	end_date: string | null;
	certificate_id: string | null;
	cert_no: string | null;
	issue_date: string | null;
	expiry_date: string | null;
	certificate_status: CertificateStatus | null;
	grade: Pick<
		GradebookRow,
		| 'theory_score'
		| 'practice_score'
		| 'theory_flag'
		| 'practice_flag'
		| 'theory_attempt'
		| 'practice_attempt'
		| 'attendance'
		| 'locked_at'
		| 'note'
		| 'computed'
	> | null;
	/** Điểm cuối cùng của từng lần thi (thi lại) */
	attempts: { part: GradePart; attempt_no: number; score: number | null; flag: GradeFlag | null }[];
	/** Điểm cũ TX/GK/CK hoặc theo bài, trước giai đoạn 4 */
	legacy: {
		subject_name: string | null;
		regular_score: number | null;
		midterm_score: number | null;
		final_score: number | null;
		score: number | null;
		result: string | null;
		classification: string | null;
	}[];
	rotations: TraineeRotation[];
}

export const traineeRecordApi = {
	checklist: (traineeId: string) => apiClient.get<DocumentChecklist>(`/trainees/${traineeId}/document-checklist`),
	reviewDocument: (docId: string, status: 'approved' | 'rejected', note?: string) =>
		apiClient.put<null>(`/trainees/documents/${docId}/review`, { status, note: note || null }),
	attendance: (traineeId: string) => apiClient.get<TraineeAttendanceCourse[]>(`/trainees/${traineeId}/attendance`),
	grades: (traineeId: string) => apiClient.get<TraineeCourseResult[]>(`/trainees/${traineeId}/grades`),
	/** null = học viên chưa có tài khoản */
	cme: (traineeId: string) => apiClient.get<MyCme | null>(`/trainees/${traineeId}/cme`),
	/** Lịch học riêng (cùng dạng lịch toàn hệ thống) — buổi kèm điểm danh. */
	schedule: (traineeId: string, from: string, to: string) =>
		apiClient.get<ClassCalendarResponse>(`/trainees/${traineeId}/schedule?${new URLSearchParams({ from, to })}`),
	// Học viên tự xem ở cổng /me (theo tài khoản đăng nhập)
	myAttendance: () => apiClient.get<TraineeAttendanceCourse[]>('/me/training/attendance'),
	myGrades: () => apiClient.get<TraineeCourseResult[]>('/me/training/grades'),
	mySchedule: (from: string, to: string) =>
		apiClient.get<ClassCalendarResponse>(`/me/training/schedule?${new URLSearchParams({ from, to })}`),
};

// Học viên tự nộp ở cổng /me
export const myTraineeDocumentsApi = {
	get: () => apiClient.get<DocumentChecklist>('/me/trainee-documents'),
	upload: (file: File, docType: string) => {
		const form = new FormData();
		form.append('doc_type', docType);
		form.append('file', file);
		return apiClient.postForm<DocumentChecklist>('/me/trainee-documents', form);
	},
	remove: (docId: string) => apiClient.delete<DocumentChecklist>(`/me/trainee-documents/${docId}`),
};

/** "Mã — Tên chương trình" của lượt ghi danh (rỗng nếu chưa gán) */
export const programLabel = (c: { program_code: string | null; program_name: string | null }) =>
	c.program_name ? `${c.program_code ? `${c.program_code} — ` : ''}${c.program_name}` : '';
