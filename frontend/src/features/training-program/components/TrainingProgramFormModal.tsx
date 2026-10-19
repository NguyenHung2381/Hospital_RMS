import { FormField } from '@/shared/components/Input/FormField';
import { Modal, ModalActions } from '@/shared/components';
import React, { useState } from 'react';
import { LayersSvg } from '@/assets/icons';
import {
	DURATION_UNIT_LABEL,
	EMPTY_FORM,
	type DurationUnit,
	type TrainingProgram,
	type TrainingProgramFormData,
} from '../types/trainingProgram.type';
import type { SimpleItem } from '../hooks/useTrainingPrograms';
import styles from '../pages/TrainingPrograms.module.css';

const str = (v: number | null | undefined) => (v != null ? String(v) : '');

const fromProgram = (p: TrainingProgram): TrainingProgramFormData => ({
	name: p.name,
	code: p.code ?? '',
	duration: p.duration ?? '',
	duration_value: str(p.duration_value),
	duration_unit: p.duration_unit ?? 'month',
	department_id: p.department_id ?? '',
	department_note: p.department_note ?? '',
	trainee_type_id: p.trainee_type_id ?? '',
	training_type_id: p.training_type_id ?? '',
	target_audience: p.target_audience ?? '',
	theory_hours: str(p.theory_hours),
	practice_hours: str(p.practice_hours),
	credit_hours: str(p.credit_hours),
	tuition_fee: str(p.tuition_fee),
	max_capacity: str(p.max_capacity),
	display_order: String(p.display_order ?? 0),
	description: p.description ?? '',
});

const isNonNegative = (s: string) => s.trim() === '' || (Number.isFinite(Number(s)) && Number(s) >= 0);

export function TrainingProgramFormModal({
	mode,
	program,
	departments,
	traineeTypes,
	trainingTypes,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	program?: TrainingProgram;
	departments: SimpleItem[];
	traineeTypes: SimpleItem[];
	trainingTypes: SimpleItem[];
	onClose: () => void;
	onSave: (d: TrainingProgramFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<TrainingProgramFormData>(program ? fromProgram(program) : EMPTY_FORM);
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
		for (const k of ['duration_value', 'theory_hours', 'practice_hours', 'credit_hours', 'tuition_fee'] as const)
			if (!isNonNegative(form[k])) err[k] = 'Phải là số không âm';
		setErrors(err);
		return Object.keys(err).length === 0;
	};

	const totalHours = (Number(form.theory_hours) || 0) + (Number(form.practice_hours) || 0);
	const numberInput = (k: keyof TrainingProgramFormData, placeholder: string, step = '1') => (
		<input
			type='number'
			min={0}
			step={step}
			className={`${styles.formInput} ${errors[k] ? styles.inputError : ''}`}
			value={form[k] as string}
			onChange={set(k)}
			placeholder={placeholder}
		/>
	);

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
						placeholder='VD: ĐTLT_5, GPHN_BS_1'
					/>
				</FormField>
				<FormField label='Loại hình'>
					<select
						className={styles.formInput}
						value={form.training_type_id}
						onChange={set('training_type_id')}
					>
						<option value=''>-- Chọn loại hình --</option>
						{trainingTypes.map((t) => (
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
					label='Tên chương trình'
					required
					error={errors.name}
					style={{ gridColumn: '1 / -1' }}
				>
					<input
						className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
						value={form.name}
						onChange={set('name')}
						placeholder='VD: Siêu âm cơ bản'
					/>
				</FormField>
				<FormField
					label='Thời lượng'
					error={errors.duration_value}
					hint={!form.duration_value && form.duration ? `Đang ghi: "${form.duration}"` : undefined}
				>
					<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
						{numberInput('duration_value', 'VD: 3', '0.5')}
						<select
							className={styles.formInput}
							style={{ maxWidth: 110 }}
							value={form.duration_unit}
							onChange={(e) => setForm((f) => ({ ...f, duration_unit: e.target.value as DurationUnit }))}
						>
							{Object.entries(DURATION_UNIT_LABEL).map(([v, label]) => (
								<option
									key={v}
									value={v}
								>
									{label}
								</option>
							))}
						</select>
					</div>
				</FormField>
				<FormField
					label='Số giờ tín chỉ'
					error={errors.credit_hours}
				>
					{numberInput('credit_hours', 'VD: 24', '0.5')}
				</FormField>
				<FormField
					label='Số tiết lý thuyết'
					error={errors.theory_hours}
				>
					{numberInput('theory_hours', '0')}
				</FormField>
				<FormField
					label='Số tiết thực hành'
					error={errors.practice_hours}
					hint={totalHours ? `Tổng số tiết: ${totalHours}` : undefined}
				>
					{numberInput('practice_hours', '0')}
				</FormField>
				<FormField
					label='Đối tượng học viên'
					hint='Ghi như danh mục, VD: Bác sĩ, Điều dưỡng, KTV'
				>
					<input
						className={styles.formInput}
						value={form.target_audience}
						onChange={set('target_audience')}
						placeholder='VD: Bác sĩ'
					/>
				</FormField>
				<FormField label='Nhóm đối tượng (lọc)'>
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
				<FormField
					label='Ghi chú khoa phụ trách'
					hint='VD: Nhiều khoa tùy từng vòng học'
				>
					<input
						className={styles.formInput}
						value={form.department_note}
						onChange={set('department_note')}
					/>
				</FormField>
				<FormField
					label='Học phí (VNĐ)'
					error={errors.tuition_fee}
				>
					{numberInput('tuition_fee', 'VD: 5000000', '1000')}
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
