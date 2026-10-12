import { ConfirmDeleteModal } from '@/shared/components';
import type { Course } from '../types/course.type';

export function CourseDeleteModal({
	course,
	onClose,
	onConfirm,
	loading,
}: {
	course: Course;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	return (
		<ConfirmDeleteModal
			title='Xoá khóa học'
			subtitle={course.name}
			onClose={onClose}
			onConfirm={onConfirm}
			loading={loading}
		>
			Bạn có chắc muốn xoá <strong>{course.name}</strong> khỏi hệ thống? Toàn bộ đăng ký, phân
			công giảng viên, lịch học và điểm danh của khóa này sẽ bị xoá theo. Thao tác này không thể
			hoàn tác.
		</ConfirmDeleteModal>
	);
}
