import React, { useState } from 'react';
import { CalendarSvg, CheckSvg, XSvg } from '@/assets/icons';
import {
	EMPTY_FORM,
	type TrainingRound,
	type TrainingRoundFormData,
	type TrainingRoundStatus,
} from '../types/trainingRound.type';
import styles from '../pages/TrainingRounds.module.css';

const STATUS_OPTIONS: { value: TrainingRoundStatus; label: string }[] = [
	{ value: 'draft', label: 'Nháp' },
	{ value: 'open', label: 'Đang mở' },
	{ value: 'closed', label: 'Đã đóng' },
];

export function TrainingRoundFormModal({
	mode,
	round,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	round?: TrainingRound;
	onClose: () => void;
	onSave: (d: TrainingRoundFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<TrainingRoundFormData>(
		round
			? {
					name: round.name,
					year: String(round.year),
					start_date: round.start_date,
					end_date: round.end_date,
					enrollment_start_date: round.enrollment_start_date ?? '',
					enrollment_end_date: round.enrollment_end_date ?? '',
					status: round.status,
				}
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<Record<keyof TrainingRoundFormData, string>>>({});

	const set =
		(k: keyof TrainingRoundFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const validate = () => {
		const err: Partial<Record<keyof TrainingRoundFormData, string>> = {};
		if (!form.name.trim()) err.name = 'Vui lòng nhập tên đợt';
		if (!form.start_date) err.start_date = 'Vui lòng chọn ngày bắt đầu';
		if (!form.end_date) err.end_date = 'Vui lòng chọn ngày kết thúc';
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
						<CalendarSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>
							{mode === 'add' ? 'Thêm đợt đào tạo' : 'Chỉnh sửa đợt đào tạo'}
						</div>
						<div className={styles.modalSub}>
							{mode === 'add' ? 'Thêm đợt đào tạo mới' : `Cập nhật — ${round?.name}`}
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
					<div className={styles.formGrid2}>
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.formLabel}>
								Tên đợt <span className={styles.required}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
								value={form.name}
								onChange={set('name')}
								placeholder='VD: Đợt đào tạo Quý 1/2026'
							/>
							{errors.name && <div className={styles.fieldError}>{errors.name}</div>}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Năm</label>
							<input
								type='number'
								className={styles.formInput}
								value={form.year}
								onChange={set('year')}
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Trạng thái</label>
							<select
								className={styles.formInput}
								value={form.status}
								onChange={set('status')}
							>
								{STATUS_OPTIONS.map((s) => (
									<option
										key={s.value}
										value={s.value}
									>
										{s.label}
									</option>
								))}
							</select>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Ngày bắt đầu <span className={styles.required}>*</span>
							</label>
							<input
								type='date'
								className={`${styles.formInput} ${errors.start_date ? styles.inputError : ''}`}
								value={form.start_date}
								onChange={set('start_date')}
							/>
							{errors.start_date && <div className={styles.fieldError}>{errors.start_date}</div>}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Ngày kết thúc <span className={styles.required}>*</span>
							</label>
							<input
								type='date'
								className={`${styles.formInput} ${errors.end_date ? styles.inputError : ''}`}
								value={form.end_date}
								onChange={set('end_date')}
							/>
							{errors.end_date && <div className={styles.fieldError}>{errors.end_date}</div>}
						</div>
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<div className={styles.hint}>
								Cửa sổ đăng ký khóa học (bỏ trống = luôn mở đăng ký trong suốt đợt)
							</div>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Mở đăng ký từ</label>
							<input
								type='date'
								className={styles.formInput}
								value={form.enrollment_start_date}
								onChange={set('enrollment_start_date')}
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Đóng đăng ký sau</label>
							<input
								type='date'
								className={styles.formInput}
								value={form.enrollment_end_date}
								onChange={set('enrollment_end_date')}
							/>
						</div>
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
						onClick={() => validate() && onSave(form)}
						disabled={loading}
					>
						{loading ? <span className={styles.spinner} /> : <CheckSvg />}
						{mode === 'add' ? 'Thêm đợt' : 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}
