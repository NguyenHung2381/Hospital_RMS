import React, { useEffect, useState } from 'react';
import { CheckSvg, LayersSvg, XSvg } from '@/assets/icons';
import { getProgramSubjectIds } from '../api/trainingProgramApi';
import { EMPTY_FORM, type TrainingProgram, type TrainingProgramFormData } from '../types/trainingProgram.type';
import type { SimpleItem } from '../hooks/useTrainingPrograms';
import styles from '../pages/TrainingPrograms.module.css';

export function TrainingProgramFormModal({
	mode,
	program,
	departments,
	traineeTypes,
	trainingTypes,
	subjects,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	program?: TrainingProgram;
	departments: SimpleItem[];
	traineeTypes: SimpleItem[];
	trainingTypes: SimpleItem[];
	subjects: SimpleItem[];
	onClose: () => void;
	onSave: (d: TrainingProgramFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<TrainingProgramFormData>(
		program
			? {
					name: program.name,
					department_id: program.department_id ?? '',
					trainee_type_id: program.trainee_type_id ?? '',
					training_type_id: program.training_type_id ?? '',
					description: program.description ?? '',
					subject_ids: program.subject_ids ?? [],
				}
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<Record<keyof TrainingProgramFormData, string>>>({});

	// /training-programs (list) không trả subject_ids cho mọi dòng (tránh join
	// thừa) — nạp riêng khi mở form sửa, giống cách CatalogFormModal nạp
	// level_ids cho tab "Loại đợt".
	useEffect(() => {
		if (mode !== 'edit' || !program) return;
		let alive = true;
		getProgramSubjectIds(program.id)
			.then((ids) => alive && setForm((f) => ({ ...f, subject_ids: ids })))
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, [mode, program]);

	const set =
		(k: 'name' | 'department_id' | 'trainee_type_id' | 'training_type_id' | 'description') =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const toggleSubject = (id: string) =>
		setForm((f) => ({
			...f,
			subject_ids: f.subject_ids.includes(id)
				? f.subject_ids.filter((x) => x !== id)
				: [...f.subject_ids, id],
		}));

	const validate = () => {
		const err: Partial<Record<keyof TrainingProgramFormData, string>> = {};
		if (!form.name.trim()) err.name = 'Vui lòng nhập tên chương trình';
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
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
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
							<label className={styles.formLabel}>Khoa / Phòng phụ trách</label>
							<select
								className={styles.formInput}
								value={form.department_id}
								onChange={set('department_id')}
							>
								<option value=''>-- Chọn --</option>
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
								<option value=''>-- Chọn --</option>
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
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.formLabel}>Loại hình đào tạo</label>
							<select
								className={styles.formInput}
								value={form.training_type_id}
								onChange={set('training_type_id')}
							>
								<option value=''>-- Chọn --</option>
								{trainingTypes.map((t) => (
									<option
										key={t.id}
										value={t.id}
									>
										{t.name}
									</option>
								))}
							</select>
						</div>
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.formLabel}>Môn học</label>
							<div className={styles.hint}>Chọn các môn học thuộc chương trình này.</div>
							<div className={styles.checkboxGrid}>
								{subjects.length === 0 && (
									<span style={{ fontSize: 13, color: 'var(--color-gray-400)' }}>
										Chưa có môn học nào trong hệ thống.
									</span>
								)}
								{subjects.map((s) => (
									<label
										key={s.id}
										className={styles.checkboxPill}
									>
										<input
											type='checkbox'
											checked={form.subject_ids.includes(s.id)}
											onChange={() => toggleSubject(s.id)}
										/>
										{s.name}
									</label>
								))}
							</div>
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
