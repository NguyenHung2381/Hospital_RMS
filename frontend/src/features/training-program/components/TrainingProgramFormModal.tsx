import { FormField } from '@/shared/components/Input/FormField';
import { Modal, ModalActions } from '@/shared/components';
import React, { useState } from 'react';
import { LayersSvg } from '@/assets/icons';
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
		<Modal
			open
			onClose={onClose}
			icon={<LayersSvg />}
			title={mode === 'add' ? 'Thêm chương trình đào tạo' : 'Chỉnh sửa chương trình đào tạo'}
			subtitle={mode === 'add' ? 'Thêm chương trình mới' : `Cập nhật — ${program?.name}`}
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={() => validate() && onSave(form)}
					loading={loading}
					confirmLabel={mode === 'add' ? 'Thêm chương trình' : 'Lưu thay đổi'}
				/>
			}
		>
			<div className={styles.formGrid2}>
				<FormField
					label='Mã chương trình'
					required
					error={errors.code}
				>
					<input
						className={`${styles.formInput} ${errors.code ? styles.inputError : ''}`}
						value={form.code}
						onChange={set('code')}
						placeholder='VD: CT-CCCB'
					/>
				</FormField>
				<FormField
					label='Tên chương trình'
					required
					error={errors.name}
				>
					<input
						className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
						value={form.name}
						onChange={set('name')}
						placeholder='VD: Chương trình đào tạo Cấp cứu cơ bản'
					/>
				</FormField>
				<FormField label='Thời lượng'>
					<input
						className={styles.formInput}
						value={form.duration}
						onChange={set('duration')}
						placeholder='VD: 3 tháng / 120 tiết'
					/>
				</FormField>
				<FormField label='Khoa phụ trách giảng dạy'>
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
				</FormField>
				<FormField label='Đối tượng học viên'>
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
				</FormField>
				<FormField
					label='Số lượng tối đa'
					error={errors.max_capacity}
				>
					<input
						type='number'
						min={1}
						className={`${styles.formInput} ${errors.max_capacity ? styles.inputError : ''}`}
						value={form.max_capacity}
						onChange={set('max_capacity')}
						placeholder='30'
					/>
				</FormField>
				<FormField label='Thứ tự'>
					<input
						type='number'
						className={styles.formInput}
						value={form.display_order}
						onChange={set('display_order')}
						placeholder='0'
					/>
				</FormField>
				<FormField
					label='Mô tả'
					style={{ gridColumn: '1 / -1' }}
				>
					<textarea
						className={styles.formTextarea}
						value={form.description}
						onChange={set('description')}
						rows={3}
						placeholder='Mô tả ngắn về chương trình...'
					/>
				</FormField>
			</div>
		</Modal>
	);
}
