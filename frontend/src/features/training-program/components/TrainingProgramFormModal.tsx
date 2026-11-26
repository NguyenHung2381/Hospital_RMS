import { FormField } from '@/shared/components/Input/FormField';
import { Modal, ModalActions, SearchableSelect } from '@/shared/components';
import React, { useId, useState } from 'react';
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
import m from '@/shared/components/Modal/Modal.module.css';
import { CfgField, CustomFields, useFormConfig, type CustomValues } from '@/shared/formConfig';
import { allowedOptions } from '@/shared/formConfig/allowedOptions';

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
	// id duy nhất cho từng ô — CfgField nối nhãn qua htmlFor
	const fieldUid = useId();
	const fid = (name: string) => `${fieldUid}-${name}`;

	const [form, setForm] = useState<TrainingProgramFormData>(program ? fromProgram(program) : EMPTY_FORM);
	// Nhãn / bắt buộc / giới hạn / trường tùy chỉnh theo Cấu hình form
	const cfg = useFormConfig('training_program', 'admin');
	const [custom, setCustom] = useState<CustomValues>(program?.custom ?? {});
	const [errors, setErrors] = useState<Record<string, string>>({});
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

	// Giờ tín chỉ để trống ⇒ hệ thống lấy tổng LT + TH; khác tổng thì chỉ cảnh báo (không chặn lưu)
	const theoryPracticeTotal = (Number(form.theory_hours) || 0) + (Number(form.practice_hours) || 0);
	const creditMismatch =
		form.credit_hours.trim() !== '' &&
		Number(form.credit_hours) > 0 &&
		theoryPracticeTotal > 0 &&
		Number(form.credit_hours) !== theoryPracticeTotal;

	const validate = () => {
		const err: Record<string, string> = cfg.validate({ ...form }, custom, { mode: mode === 'add' ? 'create' : 'edit' });
		if (!form.code.trim()) err.code ||= 'Vui lòng nhập mã chương trình';
		if (!form.name.trim()) err.name ||= 'Vui lòng nhập tên chương trình';
		if (!form.training_type_id) err.training_type_id ||= 'Vui lòng chọn loại hình';
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
		return !Object.values(err).some(Boolean) && Object.keys(rErr).length === 0;
	};

	const numberInput = (k: keyof TrainingProgramFormData, placeholder: string, step = '1') => (
		<input
			id={fid(k)}
			aria-invalid={!!errors[k] || undefined}
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
					onConfirm={() => validate() && onSave({ ...form, custom })}
					loading={loading}
					confirmLabel={mode === 'add' ? 'Thêm chương trình' : 'Lưu thay đổi'}
				/>
			}
		>
			<div className={styles.formGrid2}>
				<CfgField
					cfg={cfg}
					name='code' htmlFor={fid('code')}
					label='Mã chương trình'
					required
					error={errors.code}
				>
					<input id={fid('code')} aria-invalid={!!errors.code || undefined}
						className={`${styles.formInput} ${errors.code ? styles.inputError : ''}`}
						value={form.code}
						onChange={set('code')}
						placeholder='VD: ĐTLT_5, GPHN_BS_1'
					/>
				</CfgField>
				<CfgField
					cfg={cfg}
					name='training_type_id' htmlFor={fid('training_type_id')}
					label='Loại hình'
					required
					error={errors.training_type_id}
				>
					<select id={fid('training_type_id')}
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
				</CfgField>
				<CfgField
					cfg={cfg}
					name='name' htmlFor={fid('name')}
					label='Tên chương trình'
					required
					error={errors.name}
					style={{ gridColumn: '1 / -1' }}
				>
					<input id={fid('name')} aria-invalid={!!errors.name || undefined}
						className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
						value={form.name}
						onChange={set('name')}
						placeholder='VD: Siêu âm cơ bản'
					/>
				</CfgField>
				<CfgField
					cfg={cfg}
					name='duration_value' htmlFor={fid('duration_value')}
					label='Thời lượng'
					error={errors.duration_value}
				>
					<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
						{numberInput('duration_value', 'VD: 3', '0.5')}
						<select
							aria-label='Đơn vị thời lượng'
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
				</CfgField>
				<CfgField
					cfg={cfg}
					name='credit_hours' htmlFor={fid('credit_hours')}
					label='Số giờ tín chỉ'
					hint='Để trống = số tiết lý thuyết + thực hành (1 tiết = 1 giờ tín chỉ, Thông tư 32/2023/TT-BYT)'
					error={errors.credit_hours}
				>
					<>
						{numberInput('credit_hours', String(theoryPracticeTotal), '0.5')}
						{creditMismatch && (
							<div className={styles.creditWarn}>
								Khác số tiết của chương trình ({theoryPracticeTotal} tiết). Theo Thông tư 32/2023/TT-BYT, 1 tiết = 1 giờ
								tín chỉ.
							</div>
						)}
					</>
				</CfgField>
				<CfgField
					cfg={cfg}
					name='theory_hours' htmlFor={fid('theory_hours')}
					label='Số tiết lý thuyết'
					error={errors.theory_hours}
				>
					{numberInput('theory_hours', '0')}
				</CfgField>
				<CfgField
					cfg={cfg}
					name='practice_hours' htmlFor={fid('practice_hours')}
					label='Số tiết thực hành'
					error={errors.practice_hours}
				>
					{numberInput('practice_hours', '0')}
				</CfgField>
				<CfgField cfg={cfg} name='exam_parts' htmlFor={fid('exam_parts')} error={errors.exam_parts} label='Phần thi cuối khóa'>
					<select id={fid('exam_parts')} aria-invalid={!!errors.exam_parts || undefined}
						className={styles.formInput}
						value={form.exam_parts}
						onChange={set('exam_parts')}
					>
						<option value=''>Tự động theo số tiết ({examAutoText})</option>
						{allowedOptions(
							cfg,
							'exam_parts',
							(Object.keys(EXAM_PARTS_LABEL) as ExamParts[]).map((value) => ({ value })),
						).map(({ value: k }) => (
							<option
								key={k}
								value={k}
							>
								{EXAM_PARTS_LABEL[k]}
							</option>
						))}
					</select>
				</CfgField>
				<FormField
					label='Đối tượng học viên (chọn nhiều)'
					style={{ gridColumn: '1 / -1' }}
				>
					<div className={styles.choiceGroup} role='group' aria-label='Đối tượng học viên'>
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
				<CfgField
					cfg={cfg}
					name='target_audience' htmlFor={fid('target_audience')}
					error={errors.target_audience}
					label='Đối tượng (ghi chú, điều kiện)'
					style={{ gridColumn: '1 / -1' }}
				>
					<input id={fid('target_audience')} aria-invalid={!!errors.target_audience || undefined}
						className={styles.formInput}
						value={form.target_audience}
						onChange={set('target_audience')}
						placeholder='VD: Bác sĩ đã có CCHN'
					/>
				</CfgField>
				{(form.training_type_id === TRAINING_TYPE.GPHN || form.professional_field_id || form.practice_form_id) && (
					<>
						<CfgField
							cfg={cfg}
							name='professional_field_id' htmlFor={fid('professional_field_id')}
							error={errors.professional_field_id}
							label='Lĩnh vực chuyên môn (mặc định)'
						>
							<select id={fid('professional_field_id')} aria-invalid={!!errors.professional_field_id || undefined}
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
						</CfgField>
						<CfgField
							cfg={cfg}
							name='practice_form_id' htmlFor={fid('practice_form_id')}
							error={errors.practice_form_id}
							label='Hình thức hành nghề (mặc định)'
						>
							<select id={fid('practice_form_id')} aria-invalid={!!errors.practice_form_id || undefined}
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
						</CfgField>
					</>
				)}
				<CfgField cfg={cfg} name='department_id' htmlFor={fid('department_id')} error={errors.department_id} label='Khoa phụ trách giảng dạy'>
					<SearchableSelect id={fid('department_id')} aria-invalid={!!errors.department_id || undefined}
						options={[{ id: '', name: '-- Chọn khoa/phòng --' }, ...departments]}
						value={form.department_id}
						onChange={(id) => {
							setForm((f) => ({ ...f, department_id: id }));
							setErrors((er) => ({ ...er, department_id: '' }));
						}}
						placeholder='-- Chọn khoa/phòng --'
						searchPlaceholder='Tìm khoa/phòng...'
						hasError={!!errors.department_id}
					/>
				</CfgField>
				<CfgField cfg={cfg} name='department_note' htmlFor={fid('department_note')} error={errors.department_note} label='Ghi chú khoa phụ trách'>
					<input id={fid('department_note')} aria-invalid={!!errors.department_note || undefined}
						className={styles.formInput}
						value={form.department_note}
						onChange={set('department_note')}
						placeholder='VD: Nhiều khoa tùy từng vòng học'
					/>
				</CfgField>
				<CfgField
					cfg={cfg}
					name='tuition_fee' htmlFor={fid('tuition_fee')}
					label='Học phí (VNĐ)'
					error={errors.tuition_fee}
				>
					{numberInput('tuition_fee', 'VD: 5000000', '1000')}
				</CfgField>
				<CfgField
					cfg={cfg}
					name='min_capacity' htmlFor={fid('min_capacity')}
					label='Số lượng tối thiểu'
					error={errors.min_capacity}
				>
					<input id={fid('min_capacity')} aria-invalid={!!errors.min_capacity || undefined}
						type='number'
						min={1}
						className={`${styles.formInput} ${errors.min_capacity ? styles.inputError : ''}`}
						value={form.min_capacity}
						onChange={set('min_capacity')}
						placeholder='5'
					/>
				</CfgField>
				<CfgField
					cfg={cfg}
					name='max_capacity' htmlFor={fid('max_capacity')}
					label='Số lượng tối đa'
					error={errors.max_capacity}
				>
					<input id={fid('max_capacity')} aria-invalid={!!errors.max_capacity || undefined}
						type='number'
						min={1}
						className={`${styles.formInput} ${errors.max_capacity ? styles.inputError : ''}`}
						value={form.max_capacity}
						onChange={set('max_capacity')}
						placeholder='30'
					/>
				</CfgField>
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
					role='group'
					aria-labelledby={fid('rotations')}
				>
					<div id={fid('rotations')} className={styles.formLabel}>Vòng thực hành (luân khoa)</div>
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
								aria-label={`Tên vòng ${i + 1}`}
								aria-invalid={!!rotationErrors[i] || undefined}
								aria-describedby={rotationErrors[i] ? `${fid('rotation-error')}-${i}` : undefined}
								className={`${styles.formInput} ${rotationErrors[i] && !r.title.trim() ? styles.inputError : ''}`}
								style={{ minWidth: 140 }}
								value={r.title}
								onChange={(e) => setRotation(i, { title: e.target.value })}
								placeholder='Tên vòng, VD: Nội khoa'
							/>
							<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
								<input
									aria-label={`Thời lượng vòng ${i + 1}`}
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
									aria-label={`Đơn vị thời lượng vòng ${i + 1}`}
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
									aria-label={`Đưa vòng ${i + 1} lên`}
									disabled={i === 0}
									onClick={() => moveRotation(i, -1)}
								>
									<ArrowRSvg style={{ transform: 'rotate(-90deg)' }} />
								</button>
								<button
									type='button'
									className={styles.actionBtn}
									title='Đưa vòng xuống'
									aria-label={`Đưa vòng ${i + 1} xuống`}
									disabled={i === form.rotations.length - 1}
									onClick={() => moveRotation(i, 1)}
								>
									<ArrowRSvg style={{ transform: 'rotate(90deg)' }} />
								</button>
								<button
									type='button'
									className={styles.actionBtn}
									title='Bỏ vòng này'
									aria-label={`Bỏ vòng ${i + 1}`}
									onClick={() => removeRotation(i)}
								>
									<TrashSvg />
								</button>
							</div>
							<div className={styles.rotationDepts}>
								<TagPicker
									ariaLabel={`Khoa của vòng ${i + 1}`}
									items={departments}
									selectedIds={r.department_ids}
									label={deptLabel}
									placeholder='Gõ tên khoa...'
									emptyText='Không tìm thấy khoa phù hợp'
									onAdd={(id) => setRotation(i, { department_ids: [...r.department_ids, id] })}
									onRemove={(id) => setRotation(i, { department_ids: r.department_ids.filter((x) => x !== id) })}
								/>
								{rotationErrors[i] && (
									<div id={`${fid('rotation-error')}-${i}`} className={styles.fieldError} role='alert'>
										{rotationErrors[i]}
									</div>
								)}
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
				<CfgField
					cfg={cfg}
					name='description' htmlFor={fid('description')}
					error={errors.description}
					label='Mô tả'
					style={{ gridColumn: '1 / -1' }}
				>
					<textarea id={fid('description')} aria-invalid={!!errors.description || undefined}
						className={styles.formTextarea}
						value={form.description}
						onChange={set('description')}
						rows={3}
						placeholder='Mô tả ngắn về chương trình...'
					/>
				</CfgField>
				<CustomFields
					cfg={cfg}
					value={custom}
					onChange={setCustom}
					errors={errors}
					sectionClassName={m.formSectionTitle}
					inputClassName={styles.formInput}
				/>
			</div>
		</Modal>
	);
}
