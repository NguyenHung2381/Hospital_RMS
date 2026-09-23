import React, { useState } from 'react';
import { CheckSvg, LayersSvg, XSvg } from '@/assets/icons';
import { EMPTY_FORM, type TrainingProgram, type TrainingProgramFormData } from '../types/trainingProgram.type';
import type { SimpleItem } from '../hooks/useTrainingPrograms';
import styles from '../pages/TrainingPrograms.module.css';

export function TrainingProgramFormModal({
	mode,
	program,
	departments,
	traineeTypes,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	program?: TrainingProgram;
	departments: SimpleItem[];
	traineeTypes: SimpleItem[];
	onClose: () => void;
	onSave: (d: TrainingProgramFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<TrainingProgramFormData>(
		program
			? {
					name: program.name,
					code: program.code ?? '',
					duration: program.duration ?? '',
					department_id: program.department_id ?? '',
					trainee_type_id: program.trainee_type_id ?? '',
					max_capacity: program.max_capacity != null ? String(program.max_capacity) : '',
					display_order: String(program.display_order ?? 0),
					description: program.description ?? '',
				}
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<Record<keyof TrainingProgramFormData, string>>>({});

	const set =
		(k: keyof TrainingProgramFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const validate = () => {
		const err: Partial<Record<keyof TrainingProgramFormData, string>> = {};
		if (!form.code.trim()) err.code = 'Vui lòng nhập mã chương trình';
		if (!form.name.trim()) err.name = 'Vui lòng nhập tên chương trình';
		if (form.max_capacity && (Number(form.max_capacity) < 1 || !Number.isFinite(Number(form.max_capacity))))
			err.max_capacity = 'Số lượng phải là số nguyên dương';
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
							{mode === 'add' ? 'Thêm chương trình đào tạo' : 'Chỉnh sửa chương trình đào tạo'}
						</div>
						<div className={styles.modalSub}>
							{mode === 'add' ? 'Thêm chương trình mới' : `Cập nhật — ${program?.name}`}
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
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Mã chương trình <span className={styles.required}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${errors.code ? styles.inputError : ''}`}
								value={form.code}
								onChange={set('code')}
								placeholder='VD: CT-CCCB'
							/>
							{errors.code && <div className={styles.fieldError}>{errors.code}</div>}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Tên chương trình <span className={styles.required}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
								value={form.name}
								onChange={set('name')}
								placeholder='VD: Chương trình đào tạo Cấp cứu cơ bản'
							/>
							{errors.name && <div className={styles.fieldError}>{errors.name}</div>}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Thời lượng</label>
							<input
								className={styles.formInput}
								value={form.duration}
								onChange={set('duration')}
								placeholder='VD: 3 tháng / 120 tiết'
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Khoa phụ trách giảng dạy</label>
							<select
								className={styles.formInput}
								value={form.department_id}
								onChange={set('department_id')}
							>
								<option value=''>-- Chọn khoa/phòng --</option>
								{departments.map((d) => (
									<option
										key={d.id}
										value={d.id}
									>
										{d.name}
									</option>
								))}
							</select>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Đối tượng học viên</label>
							<select
								className={styles.formInput}
								value={form.trainee_type_id}
								onChange={set('trainee_type_id')}
							>
								<option value=''>-- Chọn đối tượng --</option>
								{traineeTypes.map((t) => (
									<option
										key={t.id}
										value={t.id}
									>
										{t.name}
									</option>
								))}
							</select>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Số lượng tối đa</label>
							<input
								type='number'
								min={1}
								className={`${styles.formInput} ${errors.max_capacity ? styles.inputError : ''}`}
								value={form.max_capacity}
								onChange={set('max_capacity')}
								placeholder='30'
							/>
							{errors.max_capacity && <div className={styles.fieldError}>{errors.max_capacity}</div>}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Thứ tự</label>
							<input
								type='number'
								className={styles.formInput}
								value={form.display_order}
								onChange={set('display_order')}
								placeholder='0'
							/>
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
								placeholder='Mô tả ngắn về chương trình...'
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
						{mode === 'add' ? 'Thêm chương trình' : 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}
