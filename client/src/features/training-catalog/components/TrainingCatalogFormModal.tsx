import React, { useState } from 'react';
import { CheckSvg, XSvg } from '@/assets/icons';
import type {
	TrainingCatalogFormData,
	TrainingCatalogItem,
	TrainingCatalogTab,
} from '../types/trainingCatalog.type';
import { EMPTY_FORM, TAB_CONFIG } from '../hooks/useTrainingCatalog';
import styles from '../pages/TrainingCatalog.module.css';

export function TrainingCatalogFormModal({
	mode,
	item,
	tab,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	item?: TrainingCatalogItem;
	tab: TrainingCatalogTab;
	onClose: () => void;
	onSave: (d: TrainingCatalogFormData) => void;
	loading: boolean;
}) {
	const cfg = TAB_CONFIG[tab];
	const [form, setForm] = useState<TrainingCatalogFormData>(
		item ? { name: item.name, description: item.description ?? '' } : EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<TrainingCatalogFormData>>({});

	const set =
		(k: keyof TrainingCatalogFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const validate = () => {
		const err: Partial<TrainingCatalogFormData> = {};
		if (!form.name.trim()) err.name = `Vui lòng nhập tên ${cfg.label.toLowerCase()}`;
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
			<div className={styles.modal}>
				<div className={styles.modalHeader}>
					<div>
						<div className={styles.modalTitle}>
							{mode === 'add'
								? `Thêm ${cfg.label.toLowerCase()}`
								: `Chỉnh sửa ${cfg.label.toLowerCase()}`}
						</div>
						<div className={styles.modalSub}>
							{mode === 'add'
								? `Thêm ${cfg.label.toLowerCase()} mới vào hệ thống`
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
							Tên {cfg.label.toLowerCase()} <span className={styles.required}>*</span>
						</label>
						<input
							className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
							value={form.name}
							onChange={set('name')}
							placeholder={cfg.placeholder}
						/>
						{errors.name && <div className={styles.fieldError}>{errors.name}</div>}
					</div>
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Mô tả</label>
						<textarea
							className={styles.formTextarea}
							value={form.description}
							onChange={set('description')}
							rows={3}
							placeholder='Mô tả ngắn...'
						/>
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
						{mode === 'add' ? `Thêm ${cfg.label.toLowerCase()}` : 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}
