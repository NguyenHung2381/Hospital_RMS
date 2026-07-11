import React, { useState } from 'react';
import { CheckSvg, ClipboardCheckSvg, XSvg } from '@/assets/icons';
import type { ResearchRound } from '../../round/types/round.type';
import {
	EMPTY_FORM,
	STATUS_LABELS,
	type Council,
	type CouncilForm,
} from '../types/council.type';
import { toInputDate } from '../utils/councilHelpers';
import styles from '../pages/Council.module.css';

export function CouncilFormModal({
	mode,
	council,
	rounds,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	council?: Council;
	rounds: ResearchRound[];
	onClose: () => void;
	onSave: (form: CouncilForm) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<CouncilForm>(
		council
			? {
					round_id: council.round_id,
					name: council.name,
					specialty_group: council.specialty_group ?? '',
					location: council.location ?? '',
					defense_date: toInputDate(council.defense_date),
					status: council.status,
				}
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<Record<keyof CouncilForm, string>>>({});

	const set =
		<K extends keyof CouncilForm>(k: K) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }) as CouncilForm);
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const validate = () => {
		const err: Partial<Record<keyof CouncilForm, string>> = {};
		if (!form.round_id) err.round_id = 'Vui lòng chọn đợt nghiên cứu';
		if (!form.name.trim()) err.name = 'Vui lòng nhập tên hội đồng';
		setErrors(err);
		return Object.keys(err).length === 0;
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={styles.modal}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<ClipboardCheckSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>
							{mode === 'add' ? 'Tạo hội đồng' : 'Chỉnh sửa hội đồng'}
						</div>
						<div className={styles.modalSub}>
							{mode === 'add'
								? 'Tạo hội đồng chấm đề cương mới'
								: `Cập nhật — ${council?.id}`}
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
					<div
						className={styles.formGroup}
						style={{ gridColumn: '1 / -1' }}
					>
						<label className={styles.formLabel}>
							Đợt nghiên cứu <span className={styles.required}>*</span>
						</label>
						<select
							className={`${styles.formInput} ${errors.round_id ? styles.inputError : ''}`}
							value={form.round_id}
							onChange={set('round_id')}
							disabled={mode === 'edit'}
						>
							<option value=''>-- Chọn đợt --</option>
							{rounds.map((r) => (
								<option
									key={r.id}
									value={r.id}
								>
									{r.name} ({r.year})
								</option>
							))}
						</select>
						{errors.round_id && (
							<div className={styles.fieldError}>{errors.round_id}</div>
						)}
					</div>

					<div className={styles.formGroup}>
						<label className={styles.formLabel}>
							Tên hội đồng <span className={styles.required}>*</span>
						</label>
						<input
							className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
							value={form.name}
							onChange={set('name')}
							placeholder='VD: Hội đồng 1 - Khoa Bỏng'
						/>
						{errors.name && (
							<div className={styles.fieldError}>{errors.name}</div>
						)}
					</div>

					<div className={styles.formGrid2}>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Hệ chuyên môn</label>
							<input
								className={styles.formInput}
								value={form.specialty_group}
								onChange={set('specialty_group')}
								placeholder='VD: Ngoại CT-Bỏng-Cột sống'
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Địa điểm</label>
							<input
								className={styles.formInput}
								value={form.location}
								onChange={set('location')}
								placeholder='VD: Hội trường 3'
							/>
						</div>
					</div>

					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Ngày bảo vệ</label>
						<input
							type='date'
							className={styles.formInput}
							value={form.defense_date}
							onChange={set('defense_date')}
						/>
					</div>

					{mode === 'edit' && (
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Trạng thái</label>
							<select
								className={styles.formInput}
								value={form.status}
								onChange={set('status')}
							>
								{Object.entries(STATUS_LABELS).map(([v, label]) => (
									<option
										key={v}
										value={v}
									>
										{label}
									</option>
								))}
							</select>
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
						className={styles.btnConfirmApprove}
						onClick={() => validate() && onSave(form)}
						disabled={loading}
					>
						{loading ? <span className={styles.spinner} /> : <CheckSvg />}
						{mode === 'add' ? 'Tạo hội đồng' : 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}
