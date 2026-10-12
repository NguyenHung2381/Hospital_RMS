import { Modal, ModalActions } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import React, { useState } from 'react';
import base from '@/shared/components/Table/CrudPage.module.css';
import styles from '../pages/CmeCreditCatalog.module.css';
import type {
	CmeCategoryFormData,
	CmeConversionMethod,
	CmeCreditCategoryItem,
	CmeCreditGroup,
} from '../types/cmeCatalog.type';
import { CONVERSION_METHOD, UNIT_SUGGESTIONS } from '../utils/cmeConversion';

const CODE_RE = /^[A-Za-z0-9_]{1,20}$/;

// Số lượng mẫu để minh hoạ công thức trong form (3 tiết, 1 lần, 2 năm).
const SAMPLE_QTY: Record<CmeConversionMethod, number> = { per_session: 3, fixed: 1, per_year: 2 };

export function CmeCategoryFormModal({
	item,
	groups,
	defaultGroupId,
	onClose,
	onSave,
	loading,
}: {
	item?: CmeCreditCategoryItem;
	groups: CmeCreditGroup[];
	defaultGroupId?: string;
	onClose: () => void;
	onSave: (d: CmeCategoryFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<CmeCategoryFormData>(
		item
			? {
					id: item.id,
					name: item.name,
					group_id: item.group_id ?? '',
					conversion_method: item.conversion_method ?? 'fixed',
					conversion_value: item.conversion_value != null ? String(Number(item.conversion_value)) : '',
					unit_label: item.unit_label ?? '',
					description: item.description ?? '',
				}
			: {
					id: '',
					name: '',
					group_id: defaultGroupId ?? '',
					conversion_method: 'fixed',
					conversion_value: '',
					unit_label: '',
					description: '',
				},
	);
	const [errors, setErrors] = useState<Partial<Record<keyof CmeCategoryFormData, string>>>({});

	const set =
		(k: keyof CmeCategoryFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: undefined }));
		};

	const setMethod = (m: CmeConversionMethod) =>
		setForm((f) => ({
			...f,
			conversion_method: m,
			// Gợi ý đơn vị theo cách quy đổi nếu người dùng chưa nhập.
			unit_label: f.unit_label || (m === 'per_session' ? 'tiết' : m === 'per_year' ? 'năm' : ''),
		}));

	const value = form.conversion_value.trim().replace(',', '.');
	const numValue = value ? Number(value) : 0;

	const handleSave = () => {
		const err: typeof errors = {};
		if (!item && form.id.trim() && !CODE_RE.test(form.id.trim()))
			err.id = 'Chỉ gồm chữ không dấu, số, dấu gạch dưới (tối đa 20 ký tự)';
		if (!form.name.trim()) err.name = 'Vui lòng nhập tên loại hình';
		if (value && (!Number.isFinite(numValue) || numValue < 0 || numValue > 9999))
			err.conversion_value = 'Số giờ phải là số từ 0 đến 9999';
		setErrors(err);
		if (Object.keys(err).length) return;
		onSave({ ...form, conversion_value: value });
	};

	const unit = form.unit_label.trim() || 'lần';
	const qty = SAMPLE_QTY[form.conversion_method];
	const preview =
		!numValue || !Number.isFinite(numValue)
			? 'Giá trị 0 hoặc để trống ⇒ người nhập tự điền số giờ CME cho từng bản ghi.'
			: `Ví dụ: ${qty} ${unit} × ${numValue} giờ = ${+(qty * numValue).toFixed(2)} giờ CME`;

	return (
		<Modal
			open
			onClose={onClose}
			title={item ? 'Chỉnh sửa loại hình quy đổi' : 'Thêm loại hình quy đổi'}
			subtitle={item ? `Cập nhật — ${item.name}` : 'Loại hoạt động và công thức quy đổi ra giờ CME'}
			className={`${base.modal} ${styles.modalWide}`}
			bodyClassName={base.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={handleSave}
					loading={loading}
					confirmLabel={item ? 'Lưu thay đổi' : 'Thêm loại hình'}
				/>
			}
		>
			<div className={styles.formRow}>
				<FormField
					label='Mã loại hình'
					error={errors.id}
				>
					<input
						className={`${base.formInput} ${styles.codeInput} ${errors.id ? base.inputError : ''}`}
						value={form.id}
						onChange={set('id')}
						placeholder='VD: HT_CHUTRI (bỏ trống để tự sinh)'
						disabled={!!item}
					/>
				</FormField>
				<FormField label='Nhóm hoạt động'>
					<select
						className={base.formInput}
						value={form.group_id}
						onChange={set('group_id')}
					>
						<option value=''>— Chưa phân nhóm —</option>
						{groups.map((g) => (
							<option
								key={g.id}
								value={g.id}
							>
								{g.name}
							</option>
						))}
					</select>
				</FormField>
			</div>

			<FormField
				label='Tên loại hình'
				required
				error={errors.name}
			>
				<input
					className={`${base.formInput} ${errors.name ? base.inputError : ''}`}
					value={form.name}
					onChange={set('name')}
					placeholder='VD: Hội nghị, hội thảo — Báo cáo viên'
					autoFocus
				/>
			</FormField>

			<div className={base.formGroup}>
				<label className={base.formLabel}>Cách quy đổi</label>
				<div className={styles.methodGroup}>
					{(Object.keys(CONVERSION_METHOD) as CmeConversionMethod[]).map((m) => (
						<button
							key={m}
							type='button'
							className={`${styles.methodBtn} ${form.conversion_method === m ? styles.methodBtnActive : ''}`}
							onClick={() => setMethod(m)}
						>
							{CONVERSION_METHOD[m].label}
						</button>
					))}
				</div>
				<div className={styles.hint}>{CONVERSION_METHOD[form.conversion_method].hint}</div>
			</div>

			<div className={styles.formRow}>
				<FormField
					label='Số giờ quy đổi'
					error={errors.conversion_value}
				>
					<input
						className={`${base.formInput} ${errors.conversion_value ? base.inputError : ''}`}
						value={form.conversion_value}
						onChange={set('conversion_value')}
						inputMode='decimal'
						placeholder='VD: 1.5'
					/>
				</FormField>
				<div className={base.formGroup}>
					<label className={base.formLabel}>Đơn vị tính (giờ / …)</label>
					<input
						className={base.formInput}
						value={form.unit_label}
						onChange={set('unit_label')}
						list='cme-unit-suggestions'
						maxLength={40}
						placeholder='VD: buổi'
					/>
					<datalist id='cme-unit-suggestions'>
						{UNIT_SUGGESTIONS.map((u) => (
							<option
								key={u}
								value={u}
							/>
						))}
					</datalist>
				</div>
			</div>
			<div className={styles.preview}>{preview}</div>

			<FormField label='Ghi chú'>
				<textarea
					className={base.formTextarea}
					value={form.description}
					onChange={set('description')}
					rows={2}
					placeholder='Điều kiện áp dụng, minh chứng cần có...'
				/>
			</FormField>
		</Modal>
	);
}
