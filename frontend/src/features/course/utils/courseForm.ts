import { TRAINING_TYPE, type Course, type CourseFormData } from '../types/course.type';

const day = (v: string | null) => (v ? v.slice(0, 10) : '');

/** Dữ liệu khóa → giá trị form thêm/sửa. */
export const courseToForm = (course: Course): CourseFormData => ({
	name: course.name,
	program_ids: course.program_ids,
	training_form_id: course.training_form_id ?? '',
	training_type_id: course.training_type_id ?? '',
	batch_no: course.batch_no != null ? String(course.batch_no) : '',
	is_rolling: course.is_rolling,
	start_date: day(course.start_date),
	end_date: day(course.end_date),
	enrollment_start_date: day(course.enrollment_start_date),
	enrollment_end_date: day(course.enrollment_end_date),
	status: course.status,
	is_public_registration: course.is_public_registration,
	description: course.description ?? '',
	prerequisites: course.prerequisites,
	objectives: course.objectives,
});

/**
 * Form điền sẵn để nhân bản 1 khóa: giữ loại khóa, chương trình, hình thức,
 * mô tả, điều kiện, mục tiêu. Khóa ĐTLT tăng số đợt (đổi luôn "Đợt N/năm" trong
 * tên), khóa khác thêm "(bản sao)". Ngày học/đăng ký để trống vì đợt mới luôn
 * khác ngày — tránh 2 khóa trùng lịch cùng "Đang mở đăng ký".
 */
export function cloneCourseForm(course: Course): CourseFormData {
	const form = courseToForm(course);
	const year = new Date().getFullYear();
	let name = `${course.name} (bản sao)`;
	let batch = form.batch_no;
	if (course.training_type_id === TRAINING_TYPE.DTLT && course.batch_no != null) {
		batch = String(course.batch_no + 1);
		const renamed = course.name.replace(/Đợt\s*\d+(\s*\/\s*\d{4})?/i, `Đợt ${batch}/${year}`);
		if (renamed !== course.name) name = renamed;
	}
	return {
		...form,
		name,
		batch_no: batch,
		status: 'draft',
		start_date: '',
		end_date: '',
		enrollment_start_date: '',
		enrollment_end_date: '',
	};
}
