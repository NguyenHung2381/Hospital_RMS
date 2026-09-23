import React, { useState } from 'react';
import { CheckSvg, LayersSvg, PlusSvg, TrashSvg, XSvg } from '@/assets/icons';
import { DatePicker } from '@/shared/components';
import { EMPTY_FORM, type Course, type CourseFormData } from '../types/course.type';
import type { SimpleItem } from '../hooks/useCourses';
import styles from '../pages/Courses.module.css';

function ListEditor({
	label,
	items,
	onChange,
	placeholder,
	addLabel,
}: {
	label: string;
	items: string[];
	onChange: (items: string[]) => void;
	placeholder: string;
	addLabel: string;
}) {
	return (
		<div
			className={styles.formGroup}
			style={{ gridColumn: '1 / -1' }}
		>
			<label className={styles.formLabel}>{label}</label>
			{items.length === 0 && <div className={styles.hint}>Chưa có mục nào.</div>}
			{items.length > 0 && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
					{items.map((item, idx) => (
						<div
							key={idx}
							style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
						>
							<span style={{ flexShrink: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-500)', minWidth: 18 }}>
								{idx + 1}.
							</span>
							<input
								className={styles.formInput}
								value={item}
								onChange={(e) => {
									const next = [...items];
									next[idx] = e.target.value;
									onChange(next);
								}}
								placeholder={placeholder}
							/>
							<button
								type='button'
								className={`${styles.actionBtn} ${styles.danger}`}
								title='Xoá mục'
								onClick={() => onChange(items.filter((_, i) => i !== idx))}
							>
								<TrashSvg />
							</button>
						</div>
					))}
				</div>
			)}
			<button
				type='button'
				className={styles.btnGhost}
				style={{ alignSelf: 'flex-start', marginTop: 'var(--space-2)' }}
				onClick={() => onChange([...items, ''])}
			>
				<PlusSvg /> {addLabel}
			</button>
		</div>
	);
}

export function CourseFormModal({
	mode,
	course,
	forms,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	course?: Course;
	forms: SimpleItem[];
	onClose: () => void;
	onSave: (d: CourseFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<CourseFormData>(
		course
			? {
					name: course.name,
					training_form_id: course.training_form_id ?? '',
					start_date: course.start_date ? course.start_date.slice(0, 10) : '',
					end_date: course.end_date ? course.end_date.slice(0, 10) : '',
					enrollment_start_date: course.enrollment_start_date ? course.enrollment_start_date.slice(0, 10) : '',
					enrollment_end_date: course.enrollment_end_date ? course.enrollment_end_date.slice(0, 10) : '',
					capacity: course.capacity != null ? String(course.capacity) : '',
					status: course.status,
					is_public_registration: course.is_public_registration,
					description: course.description ?? '',
					prerequisites: course.prerequisites,
					objectives: course.objectives,
				}
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<Record<keyof CourseFormData, string>>>({});

	const set =
		(k: keyof CourseFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const validate = () => {
		const err: Partial<Record<keyof CourseFormData, string>> = {};
		if (!form.name.trim()) err.name = 'Vui lòng nhập tên khóa học';
		if (form.capacity && (Number(form.capacity) < 1 || !Number.isFinite(Number(form.capacity))))
			err.capacity = 'Số lượng phải là số nguyên dương';
		setErrors(err);
		return Object.keys(err).length === 0;
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={styles.modal}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<LayersSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>
							{mode === 'add' ? 'Thêm khóa học' : 'Chỉnh sửa khóa học'}
						</div>
						<div className={styles.modalSub}>
							{mode === 'add' ? 'Thêm khóa học mới' : `Cập nhật — ${course?.name}`}
						</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>

				<div className={styles.modalBody}>
					<div className={styles.formGrid2}>
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.formLabel}>
								Tên khóa học <span className={styles.required}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
								value={form.name}
								onChange={set('name')}
								placeholder='VD: Khóa Cấp cứu cơ bản K1/2026'
							/>
							{errors.name && <div className={styles.fieldError}>{errors.name}</div>}
							<div className={styles.hint}>
								Chương trình đào tạo áp dụng cho khóa học được gán sau, ở tab "Chương trình áp dụng" trong màn chi tiết khóa học (1 khóa có thể áp dụng nhiều chương trình).
							</div>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Chế độ đăng ký</label>
							<select
								className={styles.formInput}
								value={form.is_public_registration ? '1' : '0'}
								onChange={(e) => setForm((f) => ({ ...f, is_public_registration: e.target.value === '1' }))}
							>
								<option value='0'>Nội bộ</option>
								<option value='1'>Công khai</option>
							</select>
							<div className={styles.hint}>
								{form.is_public_registration
									? 'Công khai: hiển thị trên cổng đăng ký không cần đăng nhập, ai cũng đăng ký được (kể cả người ngoại viện).'
									: 'Nội bộ: không hiển thị công khai, chỉ nhân viên phòng đào tạo đăng ký hộ học viên trong hệ thống.'}
							</div>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Hình thức học</label>
							<select
								className={styles.formInput}
								value={form.training_form_id}
								onChange={set('training_form_id')}
							>
								<option value=''>-- Chọn --</option>
								{forms.map((f) => (
									<option
										key={f.id}
										value={f.id}
									>
										{f.name}
									</option>
								))}
							</select>
						</div>
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.formLabel}>Sĩ số tối đa</label>
							<input
								type='number'
								min={1}
								className={`${styles.formInput} ${errors.capacity ? styles.inputError : ''}`}
								value={form.capacity}
								onChange={set('capacity')}
								placeholder='Bỏ trống = không giới hạn'
							/>
							{errors.capacity && <div className={styles.fieldError}>{errors.capacity}</div>}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Ngày bắt đầu</label>
							<DatePicker
								value={form.start_date}
								onChange={(val) => setForm((f) => ({ ...f, start_date: val }))}
								max={form.end_date || undefined}
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Ngày kết thúc</label>
							<DatePicker
								value={form.end_date}
								onChange={(val) => setForm((f) => ({ ...f, end_date: val }))}
								min={form.start_date || undefined}
							/>
						</div>
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<div className={styles.hint}>
								Cửa sổ đăng ký của riêng khóa học này (bỏ trống = luôn mở đăng ký)
							</div>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Mở đăng ký từ</label>
							<DatePicker
								value={form.enrollment_start_date}
								onChange={(val) => setForm((f) => ({ ...f, enrollment_start_date: val }))}
								max={form.enrollment_end_date || undefined}
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Đóng đăng ký sau</label>
							<DatePicker
								value={form.enrollment_end_date}
								onChange={(val) => setForm((f) => ({ ...f, enrollment_end_date: val }))}
								min={form.enrollment_start_date || undefined}
							/>
						</div>
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<div className={styles.hint}>
								Trạng thái (Sắp khai giảng/Đang mở đăng ký/Đang học/Hoàn thành) được tự động tính từ ngày tháng ở trên, không cần chọn tay.
							</div>
							{mode === 'edit' && (
								<label
									style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)', cursor: 'pointer' }}
								>
									<input
										type='checkbox'
										checked={form.status === 'cancelled'}
										onChange={(e) => setForm((f) => ({ ...f, status: e.target.checked ? 'cancelled' : 'draft' }))}
									/>
									<span style={{ color: form.status === 'cancelled' ? '#791f1f' : undefined }}>
										Huỷ khóa học này
									</span>
								</label>
							)}
						</div>
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.formLabel}>Mô tả</label>
							<textarea
								className={styles.formTextarea}
								value={form.description}
								onChange={set('description')}
								rows={3}
								placeholder='Mô tả ngắn về khóa học...'
							/>
						</div>
						<ListEditor
							label='Điều kiện'
							items={form.prerequisites}
							onChange={(items) => setForm((f) => ({ ...f, prerequisites: items }))}
							placeholder='VD: Đã hoàn thành khóa Cấp cứu cơ bản'
							addLabel='Thêm điều kiện'
						/>
						<ListEditor
							label='Mục tiêu'
							items={form.objectives}
							onChange={(items) => setForm((f) => ({ ...f, objectives: items }))}
							placeholder='VD: Nắm vững quy trình cấp cứu ngừng tuần hoàn'
							addLabel='Thêm mục tiêu'
						/>
					</div>
				</div>

				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						Huỷ
					</button>
					<button
						className={styles.btnConfirm}
						onClick={() => validate() && onSave(form)}
						disabled={loading}
					>
						{loading ? <span className={styles.spinner} /> : <CheckSvg />}
						{mode === 'add' ? 'Thêm khóa học' : 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}
