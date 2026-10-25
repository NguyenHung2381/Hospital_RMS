import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import { TRAINING_TYPE } from '../../course/types/course.type';
import { getClassCalendar } from '../api/classScheduleApi';
import { ClassScheduleBoard } from '../components/ClassScheduleBoard';

const TYPE_NAME: Record<string, string> = {
	[TRAINING_TYPE.DTLT]: 'đào tạo liên tục',
	[TRAINING_TYPE.CTCV]: 'cầm tay chỉ việc',
};

/** Lịch học các khóa của 1 loại đào tạo (tab Lịch học của mục ĐTLT / CTCV). */
export default function ClassSchedule({ typeId }: { typeId: string }) {
	const navigate = useNavigate();
	const openCourse = useCallback(
		(courseId: string) => navigate(`/admin/courses/${courseId}?tab=sessions`),
		[navigate],
	);
	const load = useCallback((from: string, to: string) => getClassCalendar(from, to, typeId), [typeId]);
	return (
		<AdminLayout
			pageTitle='Lịch học'
			pageSubtitle={`Các buổi học của khóa ${TYPE_NAME[typeId] ?? 'đào tạo'} theo tuần, tháng và năm`}
			breadcrumbs={[{ label: 'Đào tạo' }]}
		>
			<ClassScheduleBoard
				load={load}
				onOpenCourse={openCourse}
			/>
		</AdminLayout>
	);
}
