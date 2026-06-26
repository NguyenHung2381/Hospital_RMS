import React, { useState } from 'react';
import { BookOpenSvg, CheckSvg, XSvg } from '@/assets/icons';
import {
	EMPTY_FORM,
	type Department,
	type DeptFormData,
} from '../types/department.type';
import styles from '../pages/Departments.module.css';

export function DeptFormModal({
	mode,
	dept,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	dept?: Department;
	onClose: () => void;
	onSave: (d: DeptFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<DeptFormData>(
		dept
			? {
					name: dept.name,
					code: dept.code,
					abbreviation: dept.abbreviation,
					description: dept.description ?? '',
				}
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<DeptFormData>>({});

	const set =
		(k: keyof DeptFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const name = e.target.value;
		setForm((f) => ({
			...f,
			name,
			...(mode === 'add'
				? {
						code: name
							.trim()
							.split(/\s+/)
							.filter(Boolean)
							.map((w) => w[0])
							.join('')
							.toUpperCase(),
					}
				: {}),
		}));
		setErrors((er) => ({ ...er, name: '' }));
	};

	const validate = () => {
		const err: Partial<DeptFormData> = {};
		if (!form.name.trim()) err.name = 'Vui lòng nhập tên khoa phòng';
		if (!form.code.trim()) err.code = 'Vui lòng nhập mã';
		if (!form.abbreviation.trim()) err.abbreviation = 'Vui lòng nhập viết tắt';
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
						<BookOpenSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>
							{mode === 'add' ? 'Thêm khoa phòng' : 'Chỉnh sửa khoa phòng'}
						</div>
						<div className={styles.modalSub}>
							{mode === 'add'
								? 'Thêm đơn vị mới vào hệ thống'
								: `Cập nhật — ${dept?.code}`}
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
								Tên khoa phòng <span className={styles.required}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
								value={form.name}
								onChange={handleNameChange}
								placeholder='VD: Khoa Nội Tim mạch'
							/>
							{errors.name && (
								<div className={styles.fieldError}>{errors.name}</div>
							)}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Mã khoa <span className={styles.required}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${errors.code ? styles.inputError : ''}`}
								value={form.code}
								onChange={set('code')}
								placeholder='VD: NOI-TIM'
							/>
							{errors.code && (
								<div className={styles.fieldError}>{errors.code}</div>
							)}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Viết tắt <span className={styles.required}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${errors.abbreviation ? styles.inputError : ''}`}
								value={form.abbreviation}
								onChange={set('abbreviation')}
								placeholder='VD: Tim mạch'
							/>
							{errors.abbreviation && (
								<div className={styles.fieldError}>{errors.abbreviation}</div>
							)}
						</div>
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.formLabel}>Mô tả</label>
							<textarea
								className={styles.formTextarea}
								value={form.description}
								onChange={set('description')}
								rows={3}
								placeholder='Mô tả ngắn về chức năng khoa phòng...'
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
						className={styles.btnConfirmApprove}
						onClick={() => validate() && onSave(form)}
						disabled={loading}
					>
						{loading ? <span className={styles.spinner} /> : <CheckSvg />}
						{mode === 'add' ? 'Thêm khoa phòng' : 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}
