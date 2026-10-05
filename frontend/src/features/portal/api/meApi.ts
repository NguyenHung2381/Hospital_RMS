import { apiClient } from '../../../shared/api/axios';
import type { CourseDisplayStatus, DocType, EnrollmentStatus, ExamType, SourceType } from '../../course/types/course.type';
import type { AvailablePaper } from '../../exam/types/exam.type';
import type { CmeStatus, ParticipationType, SeminarEventType, SeminarScope } from '../../seminar/types/seminar.type';

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
	cert_no: string | null;
	cert_issue_date: string | null;
	cert_status: 'active' | 'revoked' | null;
	attended_count: number;
	document_count: number;
	open_exam_count: number;
	grades: MyGrade[];
}

export interface MyTeachingCourse extends MyCourseBase {
	subjects: string | null;
	approved_count: number;
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

export interface OpenCourse {
	id: string;
	name: string;
	start_date: string | null;
	end_date: string | null;
	capacity: number | null;
	program_name: string | null;
}

export interface MyTraining {
	enrolled: MyEnrolledCourse[];
	teaching: MyTeachingCourse[];
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

export interface MyCmeRecord {
	id: string;
	title: string;
	activity_date: string;
	credits: number;
	category_name: string | null;
}

export interface MyCme {
	year: number;
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

export interface MyCourseDetail {
	id: string;
	name: string;
	description: string | null;
	start_date: string | null;
	end_date: string | null;
	display_status: CourseDisplayStatus;
	enrollment_status: EnrollmentStatus;
	documents: MyCourseDocument[];
	lessons: MyLesson[];
	papers: AvailablePaper[];
}

export const getMyCourse = (id: string) => apiClient.get<MyCourseDetail>(`/me/courses/${id}`);
export const markDocumentOpened = (docId: string, kind: 'course' | 'lesson' = 'course') =>
	apiClient.patch(`/me/${kind === 'lesson' ? 'lesson-documents' : 'documents'}/${docId}/download`, {});
export const getMyTraining = () => apiClient.get<MyTraining>('/me/training');
export const registerMyCourse = (courseId: string) => apiClient.post(`/me/courses/${courseId}/register`, {});
export const getMyCme = (year: number) => apiClient.get<MyCme>(`/me/cme?year=${year}`);
/** Phiếu theo dõi CME cá nhân (Excel): năm được chọn + tổng hợp 5 năm. */
export const exportMyCmeExcel = (year: number) => apiClient.postBlob('/me/cme/export-excel', { year });
