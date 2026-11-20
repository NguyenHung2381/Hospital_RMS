import { apiClient } from '@/shared/api/axios';
import type { EnrollmentStatus } from '../types/course.type';

/** 'course': một danh sách cho cả khóa; 'program': mỗi chương trình một sheet. */
export type EnrollmentExportMode = 'course' | 'program';

export interface EnrollmentExportBody {
	mode: EnrollmentExportMode;
	/** Bỏ trống = tất cả chương trình (kể cả học viên chưa xếp chương trình). */
	program_ids?: string[];
	statuses: EnrollmentStatus[];
}

/** Xuất danh sách học viên của khóa ra Excel (POST, trả về Blob .xlsx). */
export const exportCourseEnrollments = (courseId: string, body: EnrollmentExportBody) =>
	apiClient.postBlob(`/courses/${courseId}/enrollments/export-excel`, body);
