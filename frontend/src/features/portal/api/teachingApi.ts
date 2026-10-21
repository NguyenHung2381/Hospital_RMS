import { apiClient } from '../../../shared/api/axios';
import type { Gradebook, GradeBulkRow } from '../../course/types/course.type';
import type { ExamAttemptDetail, ExamPart } from '../../exam/types/exam.type';

// Cổng giảng viên — backend modules/portal/teaching.routes.js. Chỉ phần mình được phân:
// điểm LT khi là người chấm đề lý thuyết, điểm TH khi dạy bài có tiết thực hành.

/** Bài tự luận còn câu chưa chấm của đề mình là người chấm */
export interface PendingGrading {
	attempt_id: string;
	submitted_at: string | null;
	paper_id: string;
	paper_title: string;
	exam_part: ExamPart;
	blind_grading: boolean;
	course_id: string;
	course_name: string;
	/** null khi đề chấm ẩn danh */
	trainee_name: string | null;
	pending_count: number;
}

export const teachingApi = {
	getGradebook: (courseId: string) => apiClient.get<Gradebook>(`/me/teaching/courses/${courseId}/gradebook`),
	saveGrades: (courseId: string, rows: GradeBulkRow[]) =>
		apiClient.put<{ saved: number }>(`/me/teaching/courses/${courseId}/grades/bulk`, { rows }),
	listPendingGrading: () => apiClient.get<PendingGrading[]>('/me/teaching/grading'),
	getAttempt: (attemptId: string) => apiClient.get<ExamAttemptDetail>(`/me/teaching/attempts/${attemptId}`),
	gradeAnswer: (attemptId: string, questionId: string, score: number) =>
		apiClient.post<ExamAttemptDetail>(`/me/teaching/attempts/${attemptId}/grade`, {
			question_id: questionId,
			score,
		}),
};
