import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import { ClassScheduleBoard } from '../components/ClassScheduleBoard';

export default function ClassSchedule() {
	const navigate = useNavigate();
	const openCourse = useCallback(
		(courseId: string) => navigate(`/admin/courses/${courseId}?tab=sessions`),
		[navigate],
	);
	return (
		<AdminLayout
			pageTitle='Lịch học'
			pageSubtitle='Lịch các buổi học của mọi khoá đào tạo theo tuần, tháng và năm'
		>
			<ClassScheduleBoard onOpenCourse={openCourse} />
		</AdminLayout>
	);
}
