import { useState } from 'react';
import { CheckSvg, PlusSvg, TrashSvg, XSvg } from '@/assets/icons';
import type { SimpleDept } from '../api/trainingPlanApi';
import type {
	TrainingPlan,
	TrainingPlanFormData,
	TrainingPlanItemFormData,
	TrainingPlanStatus,
} from '../types/trainingPlan.type';
import { EMPTY_FORM } from '../hooks/useTrainingPlan';
import styles from '../pages/TrainingPlan.module.css';

const STATUS_OPTIONS: { value: TrainingPlanStatus; label: string }[] = [
	{ value: 'draft', label: 'Nháp' },
	{ value: 'active', label: 'Đang thực hiện' },
	{ value: 'completed', label: 'Hoàn thành' },
	{ value: 'cancelled', label: 'Đã huỷ' },
];

let tempSeq = 0;
const nextTempId = () => `new-${Date.now()}-${tempSeq++}`;

function toForm(item?: TrainingPlan): TrainingPlanFormData {
	if (!item) return EMPTY_FORM;
	return {
		department_id: item.department_id ?? '',
		year: String(item.year),
		title: item.title,
		description: item.description ?? '',
		status: item.status,
		items: (item.items ?? []).map((it) => ({
			tempId: it.id,
			title: it.title,
			quarter: it.quarter ? String(it.quarter) : '',
			target_count: it.target_count ? String(it.target_count) : '',
			note: it.note ?? '',
		})),
	};
}

export function TrainingPlanFormModal({
	mode,
	item,
	departments,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	item?: TrainingPlan;
	departments: SimpleDept[];
	onClose: () => void;
	onSave: (d: TrainingPlanFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<TrainingPlanFormData>(toForm(item));
	const [errors, setErrors] = useState<Partial<Record<'title' | 'year', string>>>({});

	const setField = <K extends keyof TrainingPlanFormData>(k: K, val: TrainingPlanFormData[K]) => {
		setForm((f) => ({ ...f, [k]: val }));
		setErrors((er) => ({ ...er, [k as string]: '' }));
	};

	const addItem = () =>
		setForm((f) => ({
			...f,
			items: [...f.items, { tempId: nextTempId(), title: '', quarter: '', target_count: '', note: '' }],
		}));

	const removeItem = (tempId: string) =>
		setForm((f) => ({ ...f, items: f.items.filter((it) => it.tempId !== tempId) }));

	const setItemField = (tempId: string, k: keyof TrainingPlanItemFormData, val: string) =>
		setForm((f) => ({
			...f,
			items: f.items.map((it) => (it.tempId === tempId ? { ...it, [k]: val } : it)),
		}));

	const validate = () => {
		const err: Partial<Record<'title' | 'year', string>> = {};
		if (!form.title.trim()) err.title = 'Vui lòng nhập tên kế hoạch';
		if (!form.year.trim() || Number(form.year) < 2000) err.year = 'Năm không hợp lệ';
		setErrors(err);
		return Object.keys(err).length === 0;
	};

	const handleSave = () => {
		if (!validate()) return;
		onSave(form);
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalLg}`}>
				<div className={styles.modalHeader}>
					<div>
						<div className={styles.modalTitle}>
							{mode === 'add' ? 'Thêm kế hoạch đào tạo' : 'Chỉnh sửa kế hoạch đào tạo'}
						</div>
						<div className={styles.modalSub}>
							{mode === 'add' ? 'Lập kế hoạch đào tạo theo năm' : `Cập nhật — ${item?.title}`}
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
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>
							Tên kế hoạch <span className={styles.required}>*</span>
						</label>
						<input
							className={`${styles.formInput} ${errors.title ? styles.inputError : ''}`}
							value={form.title}
							onChange={(e) => setField('title', e.target.value)}
							placeholder='VD: Kế hoạch đào tạo liên tục năm 2026'
						/>
						{errors.title && <div className={styles.fieldError}>{errors.title}</div>}
					</div>

					<div className={styles.formRow}>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Năm <span className={styles.required}>*</span>
							</label>
							<input
								type='number'
								className={`${styles.formInput} ${errors.year ? styles.inputError : ''}`}
								value={form.year}
								onChange={(e) => setField('year', e.target.value)}
							/>
							{errors.year && <div className={styles.fieldError}>{errors.year}</div>}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Trạng thái</label>
							<select
								className={styles.formInput}
								value={form.status}
								onChange={(e) => setField('status', e.target.value as TrainingPlanStatus)}
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
					</div>

					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Khoa / Phòng ban</label>
						<select
							className={styles.formInput}
							value={form.department_id}
							onChange={(e) => setField('department_id', e.target.value)}
						>
							<option value=''>— Toàn viện —</option>
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
						<label className={styles.formLabel}>Mô tả</label>
						<textarea
							className={styles.formTextarea}
							value={form.description}
							onChange={(e) => setField('description', e.target.value)}
							rows={3}
							placeholder='Mục tiêu, phạm vi kế hoạch...'
						/>
					</div>

					<div className={styles.itemsSection}>
						<div className={styles.itemsSectionHeader}>
							<label className={styles.formLabel}>Hạng mục trong kế hoạch</label>
						</div>
						{form.items.length === 0 && (
							<div className={styles.emptyItems}>Chưa có hạng mục nào</div>
						)}
						{form.items.map((it) => (
							<div
								key={it.tempId}
								className={styles.itemRow}
							>
								<input
									className={styles.formInput}
									placeholder='Tên hạng mục'
									value={it.title}
									onChange={(e) => setItemField(it.tempId, 'title', e.target.value)}
								/>
								<select
									className={styles.formInput}
									value={it.quarter}
									onChange={(e) => setItemField(it.tempId, 'quarter', e.target.value)}
								>
									<option value=''>Quý</option>
									<option value='1'>Q1</option>
									<option value='2'>Q2</option>
									<option value='3'>Q3</option>
									<option value='4'>Q4</option>
								</select>
								<input
									type='number'
									className={styles.formInput}
									placeholder='Số lượt'
									value={it.target_count}
									onChange={(e) => setItemField(it.tempId, 'target_count', e.target.value)}
								/>
								<input
									className={styles.formInput}
									placeholder='Ghi chú'
									value={it.note}
									onChange={(e) => setItemField(it.tempId, 'note', e.target.value)}
								/>
								<button
									type='button'
									className={styles.itemRemoveBtn}
									onClick={() => removeItem(it.tempId)}
									title='Xoá hạng mục'
								>
									<TrashSvg />
								</button>
							</div>
						))}
						<button
							type='button'
							className={styles.addItemBtn}
							onClick={addItem}
						>
							<PlusSvg /> Thêm hạng mục
						</button>
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
						onClick={handleSave}
						disabled={loading}
					>
						{loading ? <span className={styles.spinner} /> : <CheckSvg />}
						{mode === 'add' ? 'Thêm kế hoạch' : 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}
