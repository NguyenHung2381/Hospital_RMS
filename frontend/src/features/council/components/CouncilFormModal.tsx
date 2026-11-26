import { Modal, ModalActions } from '@/shared/components';
import React, { useId, useState } from 'react';
import { ClipboardCheckSvg } from '@/assets/icons';
import type { ResearchRound } from '../../round/types/round.type';
import {
	EMPTY_FORM,
	STATUS_LABELS,
	type Council,
	type CouncilForm,
} from '../types/council.type';
import { toInputDate } from '../utils/councilHelpers';
import styles from '../pages/Council.module.css';
import { DatePicker } from '../../../shared/components/Input/DatePicker';
import { VenueSelect } from '../../venue/components/VenueSelect';

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
	const uid = useId();
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
	// Ảnh chụp ban đầu của form: so sánh để biết còn thay đổi chưa lưu khi đóng.
	const [initialForm] = useState(form);
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
		<Modal
			open
			onClose={onClose}
			dirty={JSON.stringify(form) !== JSON.stringify(initialForm)}
			icon={<ClipboardCheckSvg />}
			title={mode === 'add' ? 'Tạo hội đồng' : 'Chỉnh sửa hội đồng'}
			subtitle={mode === 'add' ? 'Tạo hội đồng chấm đề cương mới' : `Cập nhật — ${council?.id}`}
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={() => validate() && onSave(form)}
					loading={loading}
					confirmLabel={mode === 'add' ? 'Tạo hội đồng' : 'Lưu thay đổi'}
				/>
			}
		>
			<div
				className={styles.formGroup}
				style={{ gridColumn: '1 / -1' }}
			>
				<label htmlFor={`${uid}-f1`} className={styles.formLabel}>
					Đợt nghiên cứu <span className={styles.required}>*</span>
				</label>
				<select
					id={`${uid}-f1`}
					className={`${styles.formInput} ${errors.round_id ? styles.inputError : ''}`}
					aria-invalid={errors.round_id ? true : undefined}
					aria-describedby={errors.round_id ? `${uid}-f1-error` : undefined}
					aria-required
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
					<div
						id={`${uid}-f1-error`}
						className={styles.fieldError}
						role='alert'
					>
						{errors.round_id}
					</div>
				)}
			</div>

			<div className={styles.formGroup}>
				<label htmlFor={`${uid}-f2`} className={styles.formLabel}>
					Tên hội đồng <span className={styles.required}>*</span>
				</label>
				<input
					id={`${uid}-f2`}
					className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
					aria-invalid={errors.name ? true : undefined}
					aria-describedby={errors.name ? `${uid}-f2-error` : undefined}
					aria-required
					value={form.name}
					onChange={set('name')}
					placeholder='VD: Hội đồng 1 - Khoa Bỏng'
				/>
				{errors.name && (
					<div
						id={`${uid}-f2-error`}
						className={styles.fieldError}
						role='alert'
					>
						{errors.name}
					</div>
				)}
			</div>

			<div className={styles.formGrid2}>
				<div className={styles.formGroup}>
					<label htmlFor={`${uid}-f3`} className={styles.formLabel}>Hệ chuyên môn</label>
					<input
						id={`${uid}-f3`}
						className={styles.formInput}
						value={form.specialty_group}
						onChange={set('specialty_group')}
						placeholder='VD: Ngoại CT-Bỏng-Cột sống'
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Địa điểm</label>
					<VenueSelect
						scope='defense'
						className={styles.formInput}
						value={form.location}
						onChange={(location) => setForm((f) => ({ ...f, location }))}
					/>
				</div>
			</div>

			<div className={styles.formGroup}>
				<label htmlFor={`${uid}-f4`} className={styles.formLabel}>Ngày bảo vệ</label>
				<DatePicker
					id={`${uid}-f4`}
					value={form.defense_date}
					onChange={(val) =>
						setForm((prev) => ({ ...prev, defense_date: val }))
					}
					placeholder='Chọn ngày bảo vệ...'
				/>
			</div>

			{mode === 'edit' && (
				<div className={styles.formGroup}>
					<label htmlFor={`${uid}-f5`} className={styles.formLabel}>Trạng thái</label>
					<select
						id={`${uid}-f5`}
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
		</Modal>
	);
}
