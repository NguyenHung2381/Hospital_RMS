import React, { useState } from 'react';
import { CheckSvg, LayersSvg, XSvg } from '@/assets/icons';
import { EMPTY_FORM, type Course, type CourseFormData, type CourseStatus } from '../types/course.type';
import type { SimpleItem } from '../hooks/useCourses';
import styles from '../pages/Courses.module.css';

const STATUS_OPTIONS: { value: CourseStatus; label: string }[] = [
	{ value: 'draft', label: 'Nháp' },
	{ value: 'open', label: 'Đang mở đăng ký' },
	{ value: 'closed', label: 'Đã đóng đăng ký' },
	{ value: 'completed', label: 'Hoàn thành' },
	{ value: 'cancelled', label: 'Đã huỷ' },
];

export function CourseFormModal({
	mode,
	course,
	programs,
	rounds,
	forms,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	course?: Course;
	programs: SimpleItem[];
	rounds: SimpleItem[];
	forms: SimpleItem[];
	onClose: () => void;
	onSave: (d: CourseFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<CourseFormData>(
		course
			? {
					name: course.name,
					program_id: course.program_id ?? '',
					training_round_id: course.training_round_id ?? '',
					training_form_id: course.training_form_id ?? '',
					start_date: course.start_date ?? '',
					end_date: course.end_date ?? '',
					capacity: course.capacity != null ? String(course.capacity) : '',
					status: course.status,
					description: course.description ?? '',
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
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Chương trình đào tạo</label>
							<select
								className={styles.formInput}
								value={form.program_id}
								onChange={set('program_id')}
							>
								<option value=''>-- Chọn --</option>
								{programs.map((p) => (
									<option
										key={p.id}
										value={p.id}
									>
										{p.name}
									</option>
								))}
							</select>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Đợt đào tạo</label>
							<select
								className={styles.formInput}
								value={form.training_round_id}
								onChange={set('training_round_id')}
							>
								<option value=''>-- Chọn --</option>
								{rounds.map((r) => (
									<option
										key={r.id}
										value={r.id}
									>
										{r.name}
									</option>
								))}
							</select>
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
						<div className={styles.formGroup}>
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
							<input
								type='date'
								className={styles.formInput}
								value={form.start_date}
								onChange={set('start_date')}
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Ngày kết thúc</label>
							<input
								type='date'
								className={styles.formInput}
								value={form.end_date}
								onChange={set('end_date')}
							/>
						</div>
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.formLabel}>Trạng thái</label>
							<select
								className={styles.formInput}
								value={form.status}
								onChange={set('status')}
							>
								{STATUS_OPTIONS.map((s) => (
									<option
										key={s.value}
										value={s.value}
									>
										{s.label}
									</option>
								))}
							</select>
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
