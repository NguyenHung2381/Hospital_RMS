import React, { useState } from 'react';
import { CheckSvg, UserCheckSvg, XSvg } from '@/assets/icons';
import { EMPTY_FORM, GENDER_OPTIONS, type Trainee, type TraineeFormData } from '../types/trainee.type';
import type { SimpleItem } from '../hooks/useTrainees';
import styles from '../pages/Trainees.module.css';

export function TraineeFormModal({
	mode,
	trainee,
	traineeTypes,
	departments,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	trainee?: Trainee;
	traineeTypes: SimpleItem[];
	departments: SimpleItem[];
	onClose: () => void;
	onSave: (d: TraineeFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<TraineeFormData>(
		trainee
			? {
					full_name: trainee.full_name,
					dob: trainee.dob ?? '',
					gender: trainee.gender ?? '',
					national_id: trainee.national_id ?? '',
					phone: trainee.phone ?? '',
					email: trainee.email ?? '',
					address: trainee.address ?? '',
					trainee_type_id: trainee.trainee_type_id ?? '',
					department_id: trainee.department_id ?? '',
				}
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<Record<keyof TraineeFormData, string>>>({});

	const set =
		(k: keyof TraineeFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const validate = () => {
		const err: Partial<Record<keyof TraineeFormData, string>> = {};
		if (!form.full_name.trim()) err.full_name = 'Vui lòng nhập họ tên';
		if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) err.email = 'Email không hợp lệ';
		if (form.national_id && !/^\d{9,12}$/.test(form.national_id))
			err.national_id = 'CCCD/CMND phải gồm 9-12 chữ số';
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
						<UserCheckSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>
							{mode === 'add' ? 'Thêm học viên' : 'Chỉnh sửa học viên'}
						</div>
						<div className={styles.modalSub}>
							{mode === 'add' ? 'Thêm hồ sơ học viên mới' : `Cập nhật — ${trainee?.full_name}`}
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
								Họ và tên <span className={styles.required}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${errors.full_name ? styles.inputError : ''}`}
								value={form.full_name}
								onChange={set('full_name')}
								placeholder='VD: Nguyễn Văn A'
							/>
							{errors.full_name && <div className={styles.fieldError}>{errors.full_name}</div>}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Ngày sinh</label>
							<input
								type='date'
								className={styles.formInput}
								value={form.dob}
								onChange={set('dob')}
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Giới tính</label>
							<select
								className={styles.formInput}
								value={form.gender}
								onChange={set('gender')}
							>
								<option value=''>-- Chọn --</option>
								{GENDER_OPTIONS.map((g) => (
									<option
										key={g.value}
										value={g.value}
									>
										{g.label}
									</option>
								))}
							</select>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Số CCCD/CMND</label>
							<input
								className={`${styles.formInput} ${errors.national_id ? styles.inputError : ''}`}
								value={form.national_id}
								onChange={set('national_id')}
								placeholder='VD: 038201012345'
							/>
							{errors.national_id && (
								<div className={styles.fieldError}>{errors.national_id}</div>
							)}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Điện thoại</label>
							<input
								className={styles.formInput}
								value={form.phone}
								onChange={set('phone')}
								placeholder='VD: 0912345678'
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Email</label>
							<input
								className={`${styles.formInput} ${errors.email ? styles.inputError : ''}`}
								value={form.email}
								onChange={set('email')}
								placeholder='email@example.com'
							/>
							{errors.email && <div className={styles.fieldError}>{errors.email}</div>}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Đối tượng học viên</label>
							<select
								className={styles.formInput}
								value={form.trainee_type_id}
								onChange={set('trainee_type_id')}
							>
								<option value=''>-- Chọn --</option>
								{traineeTypes.map((t) => (
									<option
										key={t.id}
										value={t.id}
									>
										{t.name}
									</option>
								))}
							</select>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Khoa / Phòng (nếu là nhân viên)</label>
							<select
								className={styles.formInput}
								value={form.department_id}
								onChange={set('department_id')}
							>
								<option value=''>-- Không thuộc khoa/phòng --</option>
								{departments.map((d) => (
									<option
										key={d.id}
										value={d.id}
									>
										{d.name}
									</option>
								))}
							</select>
						</div>
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.formLabel}>Địa chỉ</label>
							<input
								className={styles.formInput}
								value={form.address}
								onChange={set('address')}
								placeholder='Địa chỉ liên hệ...'
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
						{mode === 'add' ? 'Thêm học viên' : 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}
