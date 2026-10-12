import { Modal, ModalActions } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import React, { useState } from 'react';
import base from '@/shared/components/Table/CrudPage.module.css';
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
		<Modal
			open
			onClose={onClose}
			title={item ? 'Chỉnh sửa nhóm hoạt động' : 'Thêm nhóm hoạt động'}
			subtitle={item ? `Cập nhật — ${item.name}` : 'Nhóm lớn chứa các loại hình quy đổi CME'}
			className={base.modal}
			bodyClassName={base.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={handleSave}
					loading={loading}
					confirmLabel={item ? 'Lưu thay đổi' : 'Thêm nhóm'}
				/>
			}
		>
			<div className={styles.formRow}>
				<FormField
					label='Mã nhóm'
					error={errors.id}
				>
					<input
						className={`${base.formInput} ${styles.codeInput} ${errors.id ? base.inputError : ''}`}
						value={form.id}
						onChange={set('id')}
						placeholder='VD: CME_TUHOC (bỏ trống để tự sinh)'
						disabled={!!item}
					/>
				</FormField>
				<FormField
					label='Thứ tự hiển thị'
					error={errors.sort_order}
				>
					<input
						className={`${base.formInput} ${errors.sort_order ? base.inputError : ''}`}
						value={form.sort_order}
						onChange={set('sort_order')}
						inputMode='numeric'
					/>
				</FormField>
			</div>
			<FormField
				label='Tên nhóm'
				required
				error={errors.name}
			>
				<input
					className={`${base.formInput} ${errors.name ? base.inputError : ''}`}
					value={form.name}
					onChange={set('name')}
					placeholder='VD: Nghiên cứu khoa học, giảng dạy về y khoa'
					autoFocus
				/>
			</FormField>
			<FormField label='Mô tả'>
				<textarea
					className={base.formTextarea}
					value={form.description}
					onChange={set('description')}
					rows={2}
					placeholder='Căn cứ văn bản, ghi chú...'
				/>
			</FormField>
		</Modal>
	);
}
