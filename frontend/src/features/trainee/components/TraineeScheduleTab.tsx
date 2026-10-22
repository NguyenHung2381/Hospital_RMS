import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isTraineeAccount, isTraineePath, TRAINEE_HOME } from '../../../app/router/authHelpers';
import { ClassScheduleBoard } from '../../class-schedule/components/ClassScheduleBoard';
import { traineeRecordApi } from '../api/traineeRecordApi';

/**
 * Tab "Lịch học": buổi học các lớp học viên đã được duyệt (lịch tuần / tháng / năm
 * hoặc danh sách), kèm điểm danh từng buổi. traineeId bỏ trống = học viên tự xem (/me).
 */
export function TraineeScheduleTab({ traineeId }: { traineeId?: string }) {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const selfBase = isTraineeAccount() || isTraineePath(pathname) ? `${TRAINEE_HOME}/khoa-hoc` : '/user/khoa-hoc';
	const load = useCallback(
		(from: string, to: string) =>
			traineeId ? traineeRecordApi.schedule(traineeId, from, to) : traineeRecordApi.mySchedule(from, to),
		[traineeId],
	);
	const openCourse = useCallback(
		(courseId: string) => navigate(traineeId ? `/admin/courses/${courseId}?tab=sessions` : `${selfBase}/${courseId}`),
		[navigate, traineeId, selfBase],
	);
	return <ClassScheduleBoard load={load} onOpenCourse={openCourse} courseFilterLabel='Tất cả lớp đang học' />;
}
