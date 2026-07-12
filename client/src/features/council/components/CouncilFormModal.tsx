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

const LOCATION_PRESETS = [
	'Hội trường 3',
	'Hội trường ghép tạng',
	'VP Khoa thăm dò chức năng',
	'VP Trung tâm HTSS',
	'VP Trung tâm xét nghiệm',
	'VP TT bệnh nhiệt đới',
	'VP TT Đột quỵ',
	'VP HSTC ngoại khoa',
	'VP khoa Cấp cứu',
	'VP khoa Chấn thương chỉnh hình',
	'VP khoa Cơ xương khớp',
	'VP khoa Dị ứng - MDLS',
	'VP khoa Gây mê hồi sức',
	'VP khoa HSTC',
	'VP khoa Kiểm soát nhiễm khuẩn',
	'VP khoa Ngoại thận - tiết niệu',
	'VP khoa Ngoại tổng hợp 2',
	'VP khoa Nhi - sơ sinh',
	'VP khoa Nội thận - TN - LM',
	'VP khoa Nội tiêu hoá',
	'VP khoa Nội tim mạch 1',
	'VP khoa Phẫu thuật - TMLN',
	'VP khoa Phụ sản',
	'VP khoa PTTKCS',
	'VP khoa Tai mũi họng',
	'VP khoa Thần kinh',
	'VP khoa Tim mạch 2',
	'VP khoa X-quang',
];

const CUSTOM_LOCATION = '__custom__';

export function CouncilFormModal({
	mode,
	council,
	rounds,
	existingCouncils = [],
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	council?: Council;
	rounds: ResearchRound[];
	existingCouncils?: Council[];
	onClose: () => void;
	onSave: (form: CouncilForm) => void;
	loading: boolean;
}) {
	const locationOptions = Array.from(
		new Set([
			...LOCATION_PRESETS,
			...existingCouncils.map((c) => c.location).filter((l): l is string => !!l),
		]),
	).sort();
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
	const [customLocation, setCustomLocation] = useState(
		() => !!form.location && !locationOptions.includes(form.location),
	);

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
							{customLocation ? (
								<input
									className={styles.formInput}
									value={form.location}
									onChange={set('location')}
									placeholder='Nhập địa điểm...'
									autoFocus
								/>
							) : (
								<select
									className={styles.formInput}
									value={form.location}
									onChange={(e) => {
										if (e.target.value === CUSTOM_LOCATION) {
											setCustomLocation(true);
											setForm((f) => ({ ...f, location: '' }));
										} else {
											setForm((f) => ({ ...f, location: e.target.value }));
										}
									}}
								>
									<option value=''>-- Chọn địa điểm --</option>
									{locationOptions.map((loc) => (
										<option
											key={loc}
											value={loc}
										>
											{loc}
										</option>
									))}
									<option value={CUSTOM_LOCATION}>+ Địa điểm khác...</option>
								</select>
							)}
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
