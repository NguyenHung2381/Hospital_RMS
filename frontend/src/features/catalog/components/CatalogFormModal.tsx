import React, { useEffect, useState } from 'react';
import { CalendarSvg, CheckSvg, LayersSvg, TagSvg, XSvg } from '@/assets/icons';
import type {
	CatalogFormData,
	CatalogItem,
	CatalogTab,
	LevelOption,
} from '../types/catalog.type';
import { EMPTY_FORM, TAB_CONFIG } from '../hooks/useCatalog';
import { catalogApi } from '../api/catalogApi';
import styles from '../pages/Catalog.module.css';

export function CatalogFormModal({
	mode,
	item,
	tab,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	item?: CatalogItem;
	tab: CatalogTab;
	onClose: () => void;
	onSave: (d: CatalogFormData) => void;
	loading: boolean;
}) {
	const cfg = TAB_CONFIG[tab];
	const isRoundType = tab === 'round-types';
	const [form, setForm] = useState<CatalogFormData>(
		item
			? { name: item.name, description: item.description ?? '' }
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<CatalogFormData>>({});

	// ── Cấp độ cho phép (chỉ tab "Loại đợt") ──
	const [levels, setLevels] = useState<LevelOption[]>([]);
	const [levelIds, setLevelIds] = useState<string[]>([]);

	useEffect(() => {
		if (!isRoundType) return;
		let alive = true;
		catalogApi
			.allLevels()
			.then((ls) => alive && setLevels(ls))
			.catch(() => {});
		if (mode === 'edit' && item) {
			catalogApi
				.roundTypeLevels(item.id)
				.then((ids) => alive && setLevelIds(ids))
				.catch(() => {});
		}
		return () => {
			alive = false;
		};
	}, [isRoundType, mode, item]);

	const toggleLevel = (id: string) =>
		setLevelIds((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		);

	const set =
		(k: keyof CatalogFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const validate = () => {
		const err: Partial<CatalogFormData> = {};
		if (!form.name.trim())
			err.name = `Vui lòng nhập tên ${cfg.label.toLowerCase()}`;
		setErrors(err);
		return Object.keys(err).length === 0;
	};

	const handleSave = () => {
		if (!validate()) return;
		onSave(isRoundType ? { ...form, level_ids: levelIds } : form);
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={styles.modal}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						{tab === 'categories' ? (
							<TagSvg />
						) : tab === 'round-types' ? (
							<CalendarSvg />
						) : (
							<LayersSvg />
						)}
					</div>
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
							Tên {cfg.label.toLowerCase()}{' '}
							<span className={styles.required}>*</span>
						</label>
						<input
							className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
							value={form.name}
							onChange={set('name')}
							placeholder={cfg.placeholder}
						/>
						{errors.name && (
							<div className={styles.fieldError}>{errors.name}</div>
						)}
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

					{isRoundType && (
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Cấp độ đề tài cho phép
							</label>
							<div className={styles.fieldError} style={{ color: 'var(--color-gray-500)', marginBottom: 6 }}>
								Form đăng ký đề tài chỉ hiện các cấp độ được tick ở đây. Bỏ trống
								= cho phép tất cả.
							</div>
							<div
								style={{
									display: 'flex',
									flexWrap: 'wrap',
									gap: 10,
								}}
							>
								{levels.length === 0 && (
									<span style={{ fontSize: 13, color: 'var(--color-gray-400)' }}>
										Chưa có cấp độ nào trong hệ thống.
									</span>
								)}
								{levels.map((lv) => (
									<label
										key={lv.id}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 6,
											fontSize: 13,
											cursor: 'pointer',
											padding: '4px 10px',
											borderRadius: 8,
											border: '1px solid var(--color-gray-200)',
										}}
									>
										<input
											type='checkbox'
											checked={levelIds.includes(lv.id)}
											onChange={() => toggleLevel(lv.id)}
										/>
										{lv.name}
									</label>
								))}
							</div>
						</div>
					)}
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
						{mode === 'add'
							? `Thêm ${cfg.label.toLowerCase()}`
							: 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}
