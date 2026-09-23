import React, { useState } from 'react';
import { CheckSvg, XSvg } from '@/assets/icons';
import base from '../../training-catalog/pages/TrainingCatalog.module.css';
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
		<div
			className={base.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={base.modal}>
				<div className={base.modalHeader}>
					<div>
						<div className={base.modalTitle}>{item ? 'Chỉnh sửa địa điểm' : 'Thêm địa điểm'}</div>
						<div className={base.modalSub}>
							{item ? `Cập nhật — ${item.name}` : 'Phòng họp bảo vệ đề cương, hội trường, phòng học...'}
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
					<div className={base.formGroup}>
						<label className={base.formLabel}>
							Tên địa điểm <span className={base.required}>*</span>
						</label>
						<input
							className={`${base.formInput} ${errors.name ? base.inputError : ''}`}
							value={form.name}
							onChange={set('name')}
							placeholder='VD: Hội trường A'
							autoFocus
						/>
						{errors.name && <div className={base.fieldError}>{errors.name}</div>}
					</div>

					<div className={styles.formRow}>
						<div className={base.formGroup}>
							<label className={base.formLabel}>Vị trí</label>
							<input
								className={base.formInput}
								value={form.address}
								onChange={set('address')}
								placeholder='VD: Tầng 3, nhà B'
							/>
						</div>
						<div className={base.formGroup}>
							<label className={base.formLabel}>Sức chứa (người)</label>
							<input
								className={`${base.formInput} ${errors.capacity ? base.inputError : ''}`}
								value={form.capacity}
								onChange={set('capacity')}
								inputMode='numeric'
								placeholder='VD: 50'
							/>
							{errors.capacity && <div className={base.fieldError}>{errors.capacity}</div>}
						</div>
					</div>

					<div className={styles.formRow}>
						<div className={base.formGroup}>
							<label className={base.formLabel}>Dùng cho</label>
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
						</div>
						<div className={base.formGroup}>
							<label className={base.formLabel}>Trạng thái</label>
							<label className={styles.checkLabel}>
								<input
									type='checkbox'
									checked={form.is_active}
									onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
								/>
								Đang sử dụng
							</label>
						</div>
					</div>

					<div className={base.formGroup}>
						<label className={base.formLabel}>Ghi chú</label>
						<textarea
							className={base.formTextarea}
							value={form.description}
							onChange={set('description')}
							rows={3}
							placeholder='Trang thiết bị, lưu ý khi đặt phòng...'
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
						{item ? 'Lưu thay đổi' : 'Thêm địa điểm'}
					</button>
				</div>
			</div>
		</div>
	);
}
