import React, { useState } from 'react';
import { CheckSvg, XSvg } from '@/assets/icons';
import base from '../../training-catalog/pages/TrainingCatalog.module.css';
import styles from '../pages/CmeCreditCatalog.module.css';
import type { CmeCreditGroup, CmeGroupFormData } from '../types/cmeCatalog.type';

const CODE_RE = /^[A-Za-z0-9_]{1,20}$/;

export function CmeGroupFormModal({
	item,
	nextSortOrder,
	onClose,
	onSave,
	loading,
}: {
	item?: CmeCreditGroup;
	nextSortOrder: number;
	onClose: () => void;
	onSave: (d: CmeGroupFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<CmeGroupFormData>(
		item
			? {
					id: item.id,
					name: item.name,
					sort_order: String(item.sort_order ?? 0),
					description: item.description ?? '',
				}
			: { id: '', name: '', sort_order: String(nextSortOrder), description: '' },
	);
	const [errors, setErrors] = useState<Partial<Record<keyof CmeGroupFormData, string>>>({});

	const set =
		(k: keyof CmeGroupFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: undefined }));
		};

	const handleSave = () => {
		const err: typeof errors = {};
		if (!item && form.id.trim() && !CODE_RE.test(form.id.trim()))
			err.id = 'Chỉ gồm chữ không dấu, số, dấu gạch dưới (tối đa 20 ký tự)';
		if (!form.name.trim()) err.name = 'Vui lòng nhập tên nhóm';
		if (form.sort_order.trim() && !/^\d+$/.test(form.sort_order.trim()))
			err.sort_order = 'Thứ tự phải là số nguyên ≥ 0';
		setErrors(err);
		if (Object.keys(err).length) return;
		onSave(form);
	};

	return (
		<div
			className={base.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={base.modal}>
				<div className={base.modalHeader}>
					<div>
						<div className={base.modalTitle}>{item ? 'Chỉnh sửa nhóm hoạt động' : 'Thêm nhóm hoạt động'}</div>
						<div className={base.modalSub}>
							{item ? `Cập nhật — ${item.name}` : 'Nhóm lớn chứa các loại hình quy đổi CME'}
						</div>
					</div>
					<button
						className={base.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>

				<div className={base.modalBody}>
					<div className={styles.formRow}>
						<div className={base.formGroup}>
							<label className={base.formLabel}>Mã nhóm</label>
							<input
								className={`${base.formInput} ${styles.codeInput} ${errors.id ? base.inputError : ''}`}
								value={form.id}
								onChange={set('id')}
								placeholder='VD: CME_TUHOC (bỏ trống để tự sinh)'
								disabled={!!item}
							/>
							{errors.id && <div className={base.fieldError}>{errors.id}</div>}
						</div>
						<div className={base.formGroup}>
							<label className={base.formLabel}>Thứ tự hiển thị</label>
							<input
								className={`${base.formInput} ${errors.sort_order ? base.inputError : ''}`}
								value={form.sort_order}
								onChange={set('sort_order')}
								inputMode='numeric'
							/>
							{errors.sort_order && <div className={base.fieldError}>{errors.sort_order}</div>}
						</div>
					</div>
					<div className={base.formGroup}>
						<label className={base.formLabel}>
							Tên nhóm <span className={base.required}>*</span>
						</label>
						<input
							className={`${base.formInput} ${errors.name ? base.inputError : ''}`}
							value={form.name}
							onChange={set('name')}
							placeholder='VD: Nghiên cứu khoa học, giảng dạy về y khoa'
							autoFocus
						/>
						{errors.name && <div className={base.fieldError}>{errors.name}</div>}
					</div>
					<div className={base.formGroup}>
						<label className={base.formLabel}>Mô tả</label>
						<textarea
							className={base.formTextarea}
							value={form.description}
							onChange={set('description')}
							rows={2}
							placeholder='Căn cứ văn bản, ghi chú...'
						/>
					</div>
				</div>

				<div className={base.modalFooter}>
					<button
						className={base.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						Huỷ
					</button>
					<button
						className={base.btnConfirm}
						onClick={handleSave}
						disabled={loading}
					>
						{loading ? <span className={base.spinner} /> : <CheckSvg />}
						{item ? 'Lưu thay đổi' : 'Thêm nhóm'}
					</button>
				</div>
			</div>
		</div>
	);
}
