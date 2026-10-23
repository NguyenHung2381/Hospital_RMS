import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '@/shared/utils/feedback';
import { createCourse } from '../api/courseApi';
import type { Course, CourseFormData } from '../types/course.type';
import { cloneCourseForm } from '../utils/courseForm';
import { CourseFormModal } from './CourseFormModal';

/**
 * Nhân bản khóa học: mở form thêm mới điền sẵn từ khóa gốc để sửa tên/đợt/ngày
 * rồi lưu. Chỉ sao chép thông tin khóa + chương trình áp dụng — không sao chép
 * học viên, lịch học, tài liệu, đề thi. Lưu xong chuyển sang khóa mới.
 */
export function CourseCloneModal({ course, onClose }: { course: Course; onClose: () => void }) {
	const navigate = useNavigate();
	const [saving, setSaving] = useState(false);

	const save = async (form: CourseFormData) => {
		setSaving(true);
		try {
			const created = await createCourse(form);
			showToast('success', `Đã nhân bản thành "${created.name}"`);
			onClose();
			navigate(`/admin/courses/${created.id}`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Nhân bản thất bại');
		} finally {
			setSaving(false);
		}
	};

	return (
		<CourseFormModal
			mode='add'
			initial={cloneCourseForm(course)}
			cloneOf={course.name}
			onClose={onClose}
			onSave={save}
			loading={saving}
		/>
	);
}
