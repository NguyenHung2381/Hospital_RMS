import { useState } from 'react';
import { CheckSvg, PlusSvg, TrashSvg, XSvg } from '@/assets/icons';
import type { SimpleRole } from '../api/workflowApi';
import type { StepFormData, WorkflowDefinition, WorkflowFormData } from '../types/workflow.type';
import { EMPTY_FORM } from '../hooks/useWorkflow';
import styles from '../pages/Workflow.module.css';

const RESOURCE_OPTIONS = [{ value: 'topics', label: 'Đề tài NCKH (Phê duyệt)' }];

let tempSeq = 0;
const nextTempId = () => `new-${Date.now()}-${tempSeq++}`;

function toForm(item?: WorkflowDefinition): WorkflowFormData {
	if (!item) return EMPTY_FORM;
	return {
		resource: item.resource,
		name: item.name,
		is_active: item.is_active,
		steps: (item.steps ?? []).map((s) => ({
			tempId: s.id,
			name: s.name,
			approver_role_id: s.approver_role_id ?? '',
			sla_days: s.sla_days ? String(s.sla_days) : '',
		})),
	};
}

export function WorkflowFormModal({
	mode,
	item,
	roles,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	item?: WorkflowDefinition;
	roles: SimpleRole[];
	onClose: () => void;
	onSave: (d: WorkflowFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<WorkflowFormData>(toForm(item));
	const [errors, setErrors] = useState<Partial<Record<'name', string>>>({});

	const setField = <K extends keyof WorkflowFormData>(k: K, val: WorkflowFormData[K]) => {
		setForm((f) => ({ ...f, [k]: val }));
		setErrors((er) => ({ ...er, [k as string]: '' }));
	};

	const addStep = () =>
		setForm((f) => ({
			...f,
			steps: [...f.steps, { tempId: nextTempId(), name: '', approver_role_id: '', sla_days: '' }],
		}));

	const removeStep = (tempId: string) => setForm((f) => ({ ...f, steps: f.steps.filter((s) => s.tempId !== tempId) }));

	const updateStep = (tempId: string, patch: Partial<StepFormData>) =>
		setForm((f) => ({ ...f, steps: f.steps.map((s) => (s.tempId === tempId ? { ...s, ...patch } : s)) }));

	const moveStep = (index: number, dir: -1 | 1) =>
		setForm((f) => {
			const steps = [...f.steps];
			const target = index + dir;
			if (target < 0 || target >= steps.length) return f;
			[steps[index], steps[target]] = [steps[target], steps[index]];
			return { ...f, steps };
		});

	const validate = () => {
		const err: Partial<Record<'name', string>> = {};
		if (!form.name.trim()) err.name = 'Vui lòng nhập tên workflow';
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
							{mode === 'add' ? 'Tạo workflow duyệt' : 'Chỉnh sửa workflow duyệt'}
						</div>
						<div className={styles.modalSub}>
							{mode === 'add'
								? 'Thiết lập quy trình duyệt nhiều bước'
								: `Cập nhật — ${item?.name}`}
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
							Tên workflow <span className={styles.required}>*</span>
						</label>
						<input
							className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
							value={form.name}
							onChange={(e) => setField('name', e.target.value)}
							placeholder='VD: Duyệt đề tài 2 cấp (Khoa → Phòng NCKH)'
						/>
						{errors.name && <div className={styles.fieldError}>{errors.name}</div>}
					</div>

					<div className={styles.formRow}>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Áp dụng cho</label>
							<select
								className={styles.formInput}
								value={form.resource}
								onChange={(e) => setField('resource', e.target.value)}
							>
								{RESOURCE_OPTIONS.map((r) => (
									<option
										key={r.value}
										value={r.value}
									>
										{r.label}
									</option>
								))}
							</select>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Trạng thái</label>
							<label
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 8,
									height: 38,
									fontSize: 13,
									cursor: 'pointer',
								}}
							>
								<input
									type='checkbox'
									checked={form.is_active}
									onChange={(e) => setField('is_active', e.target.checked)}
								/>
								Bật (thay thế mọi workflow khác đang bật cho cùng loại đối tượng)
							</label>
						</div>
					</div>

					<div className={styles.itemsSection}>
						<div className={styles.itemsSectionHeader}>
							<label className={styles.formLabel}>Các bước duyệt (theo thứ tự)</label>
						</div>
						{form.steps.length === 0 && <div className={styles.emptyItems}>Chưa có bước nào</div>}
						{form.steps.map((s, i) => (
							<div
								key={s.tempId}
								className={styles.questionCard}
							>
								<div className={styles.questionHeadRow}>
									<input
										className={styles.formInput}
										placeholder={`Bước ${i + 1}: tên bước`}
										value={s.name}
										onChange={(e) => updateStep(s.tempId, { name: e.target.value })}
									/>
									<select
										className={styles.formInput}
										value={s.approver_role_id}
										onChange={(e) => updateStep(s.tempId, { approver_role_id: e.target.value })}
									>
										<option value=''>— Bất kỳ ai có quyền duyệt —</option>
										{roles.map((r) => (
											<option
												key={r.id}
												value={r.id}
											>
												{r.name}
											</option>
										))}
									</select>
									<div style={{ display: 'flex', gap: 4 }}>
										<button
											type='button'
											className={styles.itemRemoveBtn}
											onClick={() => moveStep(i, -1)}
											disabled={i === 0}
											title='Lên'
										>
											↑
										</button>
										<button
											type='button'
											className={styles.itemRemoveBtn}
											onClick={() => moveStep(i, 1)}
											disabled={i === form.steps.length - 1}
											title='Xuống'
										>
											↓
										</button>
										<button
											type='button'
											className={styles.itemRemoveBtn}
											onClick={() => removeStep(s.tempId)}
											title='Xoá bước'
										>
											<TrashSvg />
										</button>
									</div>
								</div>
							</div>
						))}
						<button
							type='button'
							className={styles.addItemBtn}
							onClick={addStep}
						>
							<PlusSvg /> Thêm bước
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
						{mode === 'add' ? 'Tạo workflow' : 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}
