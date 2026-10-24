import { FormField } from '@/shared/components/Input/FormField';
import { Modal, ModalActions } from '@/shared/components';
import React, { useState } from 'react';
import { ArrowRSvg, LayersSvg, PlusSvg, TrashSvg } from '@/assets/icons';
import {
	DURATION_UNIT_LABEL,
	durationDays,
	EMPTY_FORM,
	EMPTY_ROTATION,
	type DurationUnit,
	type RotationDraft,
	type TrainingProgram,
	type TrainingProgramFormData,
} from '../types/trainingProgram.type';
import type { SimpleItem } from '../hooks/useTrainingPrograms';
import { TagPicker } from './LessonFormModal';
import { usePracticeCatalogs } from '../../catalog/hooks/usePracticeCatalogs';
import { TRAINING_TYPE, type ExamParts } from '../../course/types/course.type';

const EXAM_PARTS_LABEL: Record<ExamParts, string> = {
	theory: 'Chỉ lý thuyết',
	practice: 'Chỉ thực hành',
	both: 'Cả lý thuyết và thực hành',
};
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
	trainee_type_ids: p.trainee_type_ids ?? [],
	training_type_id: p.training_type_id ?? '',
	professional_field_id: p.professional_field_id ?? '',
	practice_form_id: p.practice_form_id ?? '',
	target_audience: p.target_audience ?? '',
	theory_hours: str(p.theory_hours),
	practice_hours: str(p.practice_hours),
	exam_parts: p.exam_parts ?? '',
	credit_hours: str(p.credit_hours),
	tuition_fee: str(p.tuition_fee),
	min_capacity: str(p.min_capacity),
	max_capacity: str(p.max_capacity),
	display_order: String(p.display_order ?? 0),
	description: p.description ?? '',
	rotations: (p.rotations ?? []).map((r) => ({
		lesson_id: r.lesson_id,
		link_id: r.link_id,
		title: r.title,
		duration_value: str(r.duration_value),
		duration_unit: r.duration_unit ?? 'month',
		department_ids: r.department_ids ? r.department_ids.split(',') : [],
	})),
});

const deptLabel = (d: SimpleItem) => d.name;

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
	const [rotationErrors, setRotationErrors] = useState<Record<number, string>>({});
	const catalogs = usePracticeCatalogs();

	const setRotation = (i: number, patch: Partial<RotationDraft>) => {
		setForm((f) => ({ ...f, rotations: f.rotations.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
		setRotationErrors((er) => ({ ...er, [i]: '' }));
	};
	const removeRotation = (i: number) => {
		setForm((f) => ({ ...f, rotations: f.rotations.filter((_, j) => j !== i) }));
		setRotationErrors({});
	};
	const moveRotation = (i: number, d: -1 | 1) => {
		setForm((f) => {
			const rs = [...f.rotations];
			[rs[i], rs[i + d]] = [rs[i + d], rs[i]];
			return { ...f, rotations: rs };
		});
		setRotationErrors({});
	};
	const rotationMonths =
		form.rotations.reduce(
			(s, r) => s + (durationDays(r.duration_value.trim() ? Number(r.duration_value) : null, r.duration_unit) ?? 0),
			0,
		) / 30;

	const set =
		(k: keyof TrainingProgramFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	// Chưa chọn phần thi: bảng điểm suy theo số tiết (gradeRules.partHours)
	const examAutoText = (() => {
		const t = form.theory_hours.trim();
		const p = form.practice_hours.trim();
		if (!t && !p) return EXAM_PARTS_LABEL.both.toLowerCase();
		const parts = [Number(t) > 0 && 'lý thuyết', Number(p) > 0 && 'thực hành'].filter(Boolean);
		return parts.length ? parts.join(' + ') : 'không thi phần nào';
	})();

	const validate = () => {
		const err: Partial<Record<keyof TrainingProgramFormData, string>> = {};
		if (!form.code.trim()) err.code = 'Vui lòng nhập mã chương trình';
		if (!form.name.trim()) err.name = 'Vui lòng nhập tên chương trình';
		if (!form.training_type_id) err.training_type_id = 'Vui lòng chọn loại hình';
		for (const k of ['min_capacity', 'max_capacity'] as const)
			if (form[k] && (Number(form[k]) < 1 || !Number.isFinite(Number(form[k]))))
				err[k] = 'Số lượng phải là số nguyên dương';
		if (form.min_capacity && form.max_capacity && Number(form.min_capacity) > Number(form.max_capacity))
			err.min_capacity = 'Không được lớn hơn số lượng tối đa';
		for (const k of ['duration_value', 'theory_hours', 'practice_hours', 'credit_hours', 'tuition_fee'] as const)
			if (!isNonNegative(form[k])) err[k] = 'Phải là số không âm';
		const rErr: Record<number, string> = {};
		form.rotations.forEach((r, i) => {
			if (!r.title.trim()) rErr[i] = 'Nhập tên vòng';
			else if (r.duration_value.trim() && !(Number(r.duration_value) > 0)) rErr[i] = 'Thời lượng phải là số dương';
			else if (!r.department_ids.length) rErr[i] = 'Chọn ít nhất 1 khoa';
		});
		setErrors(err);
		setRotationErrors(rErr);
		return Object.keys(err).length === 0 && Object.keys(rErr).length === 0;
	};

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
				<FormField
					label='Loại hình'
					required
					error={errors.training_type_id}
				>
					<select
						className={`${styles.formInput} ${errors.training_type_id ? styles.inputError : ''}`}
						aria-invalid={errors.training_type_id ? true : undefined}
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
				>
					{numberInput('practice_hours', '0')}
				</FormField>
				<FormField label='Phần thi cuối khóa'>
					<select
						className={styles.formInput}
						value={form.exam_parts}
						onChange={set('exam_parts')}
					>
						<option value=''>Tự động theo số tiết ({examAutoText})</option>
						{(Object.keys(EXAM_PARTS_LABEL) as ExamParts[]).map((k) => (
							<option
								key={k}
								value={k}
							>
								{EXAM_PARTS_LABEL[k]}
							</option>
						))}
					</select>
				</FormField>
				<FormField
					label='Đối tượng học viên (chọn nhiều)'
					style={{ gridColumn: '1 / -1' }}
				>
					<div className={styles.choiceGroup}>
						{traineeTypes.map((t) => {
							const on = form.trainee_type_ids.includes(t.id);
							return (
								<button
									key={t.id}
									type='button'
									aria-pressed={on}
									className={`${styles.choiceChip} ${on ? styles.choiceChipOn : ''}`}
									onClick={() =>
										setForm((f) => ({
											...f,
											trainee_type_ids: on
												? f.trainee_type_ids.filter((x) => x !== t.id)
												: [...f.trainee_type_ids, t.id],
										}))
									}
								>
									{t.name}
								</button>
							);
						})}
					</div>
				</FormField>
				<FormField
					label='Đối tượng (ghi chú, điều kiện)'
					style={{ gridColumn: '1 / -1' }}
				>
					<input
						className={styles.formInput}
						value={form.target_audience}
						onChange={set('target_audience')}
						placeholder='VD: Bác sĩ đã có CCHN'
					/>
				</FormField>
				{(form.training_type_id === TRAINING_TYPE.GPHN || form.professional_field_id || form.practice_form_id) && (
					<>
						<FormField
							label='Lĩnh vực chuyên môn (mặc định)'
						>
							<select
								className={styles.formInput}
								value={form.professional_field_id}
								onChange={set('professional_field_id')}
								title='Tự điền vào hồ sơ thực hành GPHN của chương trình — thêm giá trị ở Danh mục đào tạo'
							>
								<option value=''>-- Không đặt --</option>
								{catalogs.fields.map((x) => (
									<option
										key={x.id}
										value={x.id}
									>
										{x.name}
									</option>
								))}
							</select>
						</FormField>
						<FormField
							label='Hình thức hành nghề (mặc định)'
						>
							<select
								className={styles.formInput}
								value={form.practice_form_id}
								onChange={set('practice_form_id')}
								title='Tự điền vào hồ sơ thực hành GPHN của chương trình — thêm giá trị ở Danh mục đào tạo'
							>
								<option value=''>-- Không đặt --</option>
								{catalogs.forms.map((x) => (
									<option
										key={x.id}
										value={x.id}
									>
										{x.name}
									</option>
								))}
							</select>
						</FormField>
					</>
				)}
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
				<FormField label='Ghi chú khoa phụ trách'>
					<input
						className={styles.formInput}
						value={form.department_note}
						onChange={set('department_note')}
						placeholder='VD: Nhiều khoa tùy từng vòng học'
					/>
				</FormField>
				<FormField
					label='Học phí (VNĐ)'
					error={errors.tuition_fee}
				>
					{numberInput('tuition_fee', 'VD: 5000000', '1000')}
				</FormField>
				<FormField
					label='Số lượng tối thiểu'
					error={errors.min_capacity}
				>
					<input
						type='number'
						min={1}
						className={`${styles.formInput} ${errors.min_capacity ? styles.inputError : ''}`}
						value={form.min_capacity}
						onChange={set('min_capacity')}
						placeholder='5'
					/>
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
				<div
					className={styles.formGroup}
					style={{ gridColumn: '1 / -1' }}
				>
					<label className={styles.formLabel}>Vòng thực hành (luân khoa)</label>
					<div className={styles.subRowMeta}>
						Học viên học lần lượt nhiều khoa, mỗi vòng thời lượng riêng. Một vòng có thể chọn nhiều khoa — học viên
						được xếp vào 1 trong các khoa đó.
					</div>
					{form.rotations.map((r, i) => (
						<div
							key={r.link_id ?? `new-${i}`}
							className={styles.rotationRow}
						>
							<span className={styles.rotationIdx}>Vòng {i + 1}</span>
							<input
								className={`${styles.formInput} ${rotationErrors[i] && !r.title.trim() ? styles.inputError : ''}`}
								style={{ minWidth: 140 }}
								value={r.title}
								onChange={(e) => setRotation(i, { title: e.target.value })}
								placeholder='Tên vòng, VD: Nội khoa'
							/>
							<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
								<input
									type='number'
									min={0}
									step='0.5'
									className={styles.formInput}
									style={{ width: 80 }}
									value={r.duration_value}
									onChange={(e) => setRotation(i, { duration_value: e.target.value })}
									placeholder='VD: 3'
								/>
								<select
									className={styles.formInput}
									style={{ width: 90 }}
									value={r.duration_unit}
									onChange={(e) => setRotation(i, { duration_unit: e.target.value as DurationUnit })}
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
							<div className={styles.rotationActions}>
								<button
									type='button'
									className={styles.actionBtn}
									title='Đưa vòng lên'
									disabled={i === 0}
									onClick={() => moveRotation(i, -1)}
								>
									<ArrowRSvg style={{ transform: 'rotate(-90deg)' }} />
								</button>
								<button
									type='button'
									className={styles.actionBtn}
									title='Đưa vòng xuống'
									disabled={i === form.rotations.length - 1}
									onClick={() => moveRotation(i, 1)}
								>
									<ArrowRSvg style={{ transform: 'rotate(90deg)' }} />
								</button>
								<button
									type='button'
									className={styles.actionBtn}
									title='Bỏ vòng này'
									onClick={() => removeRotation(i)}
								>
									<TrashSvg />
								</button>
							</div>
							<div className={styles.rotationDepts}>
								<TagPicker
									items={departments}
									selectedIds={r.department_ids}
									label={deptLabel}
									placeholder='Gõ tên khoa...'
									emptyText='Không tìm thấy khoa phù hợp'
									onAdd={(id) => setRotation(i, { department_ids: [...r.department_ids, id] })}
									onRemove={(id) => setRotation(i, { department_ids: r.department_ids.filter((x) => x !== id) })}
								/>
								{rotationErrors[i] && <div className={styles.fieldError}>{rotationErrors[i]}</div>}
							</div>
						</div>
					))}
					<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
						<button
							type='button'
							className={styles.btnGhost}
							onClick={() => setForm((f) => ({ ...f, rotations: [...f.rotations, { ...EMPTY_ROTATION }] }))}
						>
							<PlusSvg /> Thêm vòng
						</button>
						{rotationMonths > 0 && (
							<span className={styles.subRowMeta}>
								Tổng ≈ {String(Math.round(rotationMonths * 10) / 10).replace('.', ',')} tháng
							</span>
						)}
					</div>
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
						placeholder='Mô tả ngắn về chương trình...'
					/>
				</FormField>
			</div>
		</Modal>
	);
}
