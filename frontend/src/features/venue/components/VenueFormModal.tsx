import { Modal, ModalActions } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import React, { useState } from 'react';
import base from '@/shared/components/Table/CrudPage.module.css';
import styles from '../pages/Venues.module.css';
import { SCOPE_LABEL } from '../utils/venueScope';
import type { Venue, VenueFormData, VenueScope } from '../types/venue.type';

const EMPTY_FORM: VenueFormData = {
	name: '',
	address: '',
	capacity: '',
	usage_scope: 'both',
	is_active: true,
	description: '',
};

export function VenueFormModal({
	item,
	onClose,
	onSave,
	loading,
}: {
	item?: Venue;
	onClose: () => void;
	onSave: (d: VenueFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<VenueFormData>(
		item
			? {
					name: item.name,
					address: item.address ?? '',
					capacity: item.capacity != null ? String(item.capacity) : '',
					usage_scope: item.usage_scope,
					is_active: item.is_active,
					description: item.description ?? '',
				}
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<{ name?: string; capacity?: string }>({});

	const set =
		(k: 'name' | 'address' | 'capacity' | 'description') =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: undefined }));
		};

	const handleSave = () => {
		const err: typeof errors = {};
		if (!form.name.trim()) err.name = 'Vui lòng nhập tên địa điểm';
		const cap = form.capacity.trim();
		if (cap && (!/^\d+$/.test(cap) || Number(cap) < 1)) err.capacity = 'Sức chứa phải là số nguyên dương';
		setErrors(err);
		if (Object.keys(err).length) return;
		onSave(form);
	};

	return (
		<Modal
			open
			onClose={onClose}
			title={item ? 'Chỉnh sửa địa điểm' : 'Thêm địa điểm'}
			subtitle={item ? `Cập nhật — ${item.name}` : 'Phòng họp bảo vệ đề cương, hội trường, phòng học...'}
			className={base.modal}
			bodyClassName={base.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={handleSave}
					loading={loading}
					confirmLabel={item ? 'Lưu thay đổi' : 'Thêm địa điểm'}
				/>
			}
		>
			<FormField
				label='Tên địa điểm'
				required
				error={errors.name}
			>
				<input
					className={`${base.formInput} ${errors.name ? base.inputError : ''}`}
					value={form.name}
					onChange={set('name')}
					placeholder='VD: Hội trường A'
					autoFocus
				/>
			</FormField>

			<div className={styles.formRow}>
				<FormField label='Vị trí'>
					<input
						className={base.formInput}
						value={form.address}
						onChange={set('address')}
						placeholder='VD: Tầng 3, nhà B'
					/>
				</FormField>
				<FormField
					label='Sức chứa (người)'
					error={errors.capacity}
				>
					<input
						className={`${base.formInput} ${errors.capacity ? base.inputError : ''}`}
						value={form.capacity}
						onChange={set('capacity')}
						inputMode='numeric'
						placeholder='VD: 50'
					/>
				</FormField>
			</div>

			<div className={styles.formRow}>
				<FormField label='Dùng cho'>
					<select
						className={base.formInput}
						value={form.usage_scope}
						onChange={(e) =>
							setForm((f) => ({ ...f, usage_scope: e.target.value as VenueScope }))
						}
					>
						{(Object.keys(SCOPE_LABEL) as VenueScope[]).map((s) => (
							<option
								key={s}
								value={s}
							>
								{SCOPE_LABEL[s].label}
							</option>
						))}
					</select>
				</FormField>
				<FormField label='Trạng thái'>
					<label className={styles.checkLabel}>
						<input
							type='checkbox'
							checked={form.is_active}
							onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
						/>
						Đang sử dụng
					</label>
				</FormField>
			</div>

			<FormField label='Ghi chú'>
				<textarea
					className={base.formTextarea}
					value={form.description}
					onChange={set('description')}
					rows={3}
					placeholder='Trang thiết bị, lưu ý khi đặt phòng...'
				/>
			</FormField>
		</Modal>
	);
}
