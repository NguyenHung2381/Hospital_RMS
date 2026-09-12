import React, { useState } from 'react';
import { CheckSvg, UserCheckSvg, XSvg } from '@/assets/icons';
import { EMPTY_FORM, type Lecturer, type LecturerFormData } from '../types/lecturer.type';
import styles from '../pages/Lecturers.module.css';

export function LecturerFormModal({
	mode,
	lecturer,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	lecturer?: Lecturer;
	onClose: () => void;
	onSave: (d: LecturerFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<LecturerFormData>(
		lecturer
			? {
					full_name: lecturer.full_name,
					specialty: lecturer.specialty ?? '',
					is_external: lecturer.is_external,
					phone: lecturer.phone ?? '',
					email: lecturer.email ?? '',
				}
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<Record<keyof LecturerFormData, string>>>({});

	const set =
		(k: keyof LecturerFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const validate = () => {
		const err: Partial<Record<keyof LecturerFormData, string>> = {};
		if (!form.full_name.trim()) err.full_name = 'Vui lòng nhập họ tên';
		if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) err.email = 'Email không hợp lệ';
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
							{mode === 'add' ? 'Thêm giảng viên' : 'Chỉnh sửa giảng viên'}
						</div>
						<div className={styles.modalSub}>
							{mode === 'add' ? 'Thêm giảng viên mới vào hệ thống' : `Cập nhật — ${lecturer?.full_name}`}
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
								placeholder='VD: BS. Nguyễn Văn A'
							/>
							{errors.full_name && <div className={styles.fieldError}>{errors.full_name}</div>}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Chuyên môn</label>
							<input
								className={styles.formInput}
								value={form.specialty}
								onChange={set('specialty')}
								placeholder='VD: Hồi sức cấp cứu'
							/>
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
								placeholder='email@benhvien.vn'
							/>
							{errors.email && <div className={styles.fieldError}>{errors.email}</div>}
						</div>
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.checkboxRow}>
								<input
									type='checkbox'
									checked={form.is_external}
									onChange={(e) =>
										setForm((f) => ({ ...f, is_external: e.target.checked }))
									}
								/>
								Giảng viên mời ngoài (không phải nhân viên bệnh viện)
							</label>
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
						{mode === 'add' ? 'Thêm giảng viên' : 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}
