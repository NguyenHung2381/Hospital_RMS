import { FormField } from '@/shared/components/Input/FormField';
import React, { useEffect, useState } from 'react';
import { Modal, ModalActions } from '@/shared/components';
import m from '@/shared/components/Modal/Modal.module.css';
import { catalogApi } from '../api/catalogApi';
import { EMPTY_FORM, TAB_CONFIG } from '../hooks/useCatalog';
import type { CatalogFormData, CatalogItem, CatalogTab, LevelOption } from '../types/catalog.type';
import styles from './CatalogFormModal.module.css';

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
	const label = cfg.label.toLowerCase();
	const isRoundType = tab === 'round-types';
	const [form, setForm] = useState<CatalogFormData>(
		item ? { name: item.name, description: item.description ?? '' } : EMPTY_FORM,
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
		setLevelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

	const set =
		(k: keyof CatalogFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const handleSave = () => {
		if (!form.name.trim()) {
			setErrors({ name: `Vui lòng nhập tên ${label}` });
			return;
		}
		onSave(isRoundType ? { ...form, level_ids: levelIds } : form);
	};

	return (
		<Modal
			open
			onClose={onClose}
			icon={<cfg.icon />}
			title={mode === 'add' ? `Thêm ${label}` : `Chỉnh sửa ${label}`}
			subtitle={mode === 'add' ? `Thêm ${label} mới vào hệ thống` : `Cập nhật — ${item?.name}`}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={handleSave}
					loading={loading}
					confirmLabel={mode === 'add' ? `Thêm ${label}` : 'Lưu thay đổi'}
				/>
			}
		>
			<div className={m.stack}>
				<FormField
					label={<>Tên {label}</>}
					required
					error={errors.name}
				>
					<input
						className={`${m.formInput} ${errors.name ? m.inputError : ''}`}
						value={form.name}
						onChange={set('name')}
						placeholder={cfg.placeholder}
					/>
				</FormField>
				<FormField label='Mô tả'>
					<textarea
						className={m.formTextarea}
						value={form.description}
						onChange={set('description')}
						rows={3}
						placeholder='Mô tả ngắn...'
					/>
				</FormField>

				{isRoundType && (
					<div className={m.formGroup}>
						<label className={m.formLabel}>Cấp độ đề tài cho phép</label>
						<div className={styles.hint}>
							Form đăng ký đề tài chỉ hiện các cấp độ được tick ở đây. Bỏ trống = cho phép tất cả.
						</div>
						<div className={styles.levels}>
							{levels.length === 0 && <span className={styles.empty}>Chưa có cấp độ nào trong hệ thống.</span>}
							{levels.map((lv) => (
								<label
									key={lv.id}
									className={styles.level}
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
		</Modal>
	);
}
