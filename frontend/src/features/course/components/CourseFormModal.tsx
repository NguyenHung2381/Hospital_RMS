import { FormField } from '@/shared/components/Input/FormField';
import React, { useEffect, useState } from 'react';
import { CheckSmSvg, LayersSvg, PlusSvg, TrashSvg } from '@/assets/icons';
import { DatePicker, Modal, ModalActions } from '@/shared/components';
import { apiClient } from '@/shared/api/axios';
import { EMPTY_FORM, type Course, type CourseFormData } from '../types/course.type';

interface SimpleItem {
	id: string;
	name: string;
}
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
	initial,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	course?: Course;
	/** Giá trị điền sẵn khi thêm mới (vd tạo khóa từ hạng mục kế hoạch). */
	initial?: Partial<CourseFormData>;
	onClose: () => void;
	onSave: (d: CourseFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<CourseFormData>(
		course
			? {
					name: course.name,
					program_ids: course.program_ids,
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
			: { ...EMPTY_FORM, ...initial },
	);
	const [forms, setForms] = useState<SimpleItem[]>([]);
	const [programs, setPrograms] = useState<SimpleItem[]>([]);

	useEffect(() => {
		apiClient.get<{ data: SimpleItem[] }>('/training-forms?limit=0').then((r) => setForms(r.data)).catch(() => {});
		apiClient.get<{ data: SimpleItem[] }>('/training-programs?limit=0').then((r) => setPrograms(r.data)).catch(() => {});
	}, []);
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
		<Modal
			open
			onClose={onClose}
			icon={<LayersSvg />}
			title={mode === 'add' ? 'Thêm khóa học' : 'Chỉnh sửa khóa học'}
			subtitle={mode === 'add' ? 'Thêm khóa học mới' : `Cập nhật — ${course?.name}`}
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={() => validate() && onSave(form)}
					loading={loading}
					confirmLabel={mode === 'add' ? 'Thêm khóa học' : 'Lưu thay đổi'}
				/>
			}
		>
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
				</div>
				<FormField
					label='Chương trình đào tạo áp dụng'
					hint='Nội dung học (bài học) lấy theo chương trình. Một khóa có thể áp dụng nhiều chương trình.'
					style={{ gridColumn: '1 / -1' }}
				>
					{programs.length === 0 ? (
						<div className={styles.hint}>Chưa có chương trình đào tạo nào.</div>
					) : (
						<div className={styles.pickList}>
							{programs.map((p) => {
								const on = form.program_ids.includes(p.id);
								return (
									<button
										key={p.id}
										type='button'
										aria-pressed={on}
										className={`${styles.pickChip} ${on ? styles.pickChipOn : ''}`}
										onClick={() =>
											setForm((f) => ({
												...f,
												program_ids: on ? f.program_ids.filter((x) => x !== p.id) : [...f.program_ids, p.id],
											}))
										}
									>
										{on && <CheckSmSvg />}
										{p.name}
									</button>
								);
							})}
						</div>
					)}
				</FormField>
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
				<FormField label='Hình thức học'>
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
				</FormField>
				<FormField
					label='Sĩ số tối đa'
					error={errors.capacity}
					style={{ gridColumn: '1 / -1' }}
				>
					<input
						type='number'
						min={1}
						className={`${styles.formInput} ${errors.capacity ? styles.inputError : ''}`}
						value={form.capacity}
						onChange={set('capacity')}
						placeholder='Bỏ trống = không giới hạn'
					/>
				</FormField>
				<FormField label='Ngày bắt đầu'>
					<DatePicker
						value={form.start_date}
						onChange={(val) => setForm((f) => ({ ...f, start_date: val }))}
						max={form.end_date || undefined}
					/>
				</FormField>
				<FormField label='Ngày kết thúc'>
					<DatePicker
						value={form.end_date}
						onChange={(val) => setForm((f) => ({ ...f, end_date: val }))}
						min={form.start_date || undefined}
					/>
				</FormField>
				<div
					className={styles.formGroup}
					style={{ gridColumn: '1 / -1' }}
				>
					<div className={styles.hint}>
						Cửa sổ đăng ký của riêng khóa học này (bỏ trống = luôn mở đăng ký)
					</div>
				</div>
				<FormField label='Mở đăng ký từ'>
					<DatePicker
						value={form.enrollment_start_date}
						onChange={(val) => setForm((f) => ({ ...f, enrollment_start_date: val }))}
						max={form.enrollment_end_date || undefined}
					/>
				</FormField>
				<FormField label='Đóng đăng ký sau'>
					<DatePicker
						value={form.enrollment_end_date}
						onChange={(val) => setForm((f) => ({ ...f, enrollment_end_date: val }))}
						min={form.enrollment_start_date || undefined}
					/>
				</FormField>
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
				<FormField
					label='Mô tả'
					style={{ gridColumn: '1 / -1' }}
				>
					<textarea
						className={styles.formTextarea}
						value={form.description}
						onChange={set('description')}
						rows={3}
						placeholder='Mô tả ngắn về khóa học...'
					/>
				</FormField>
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
		</Modal>
	);
}
