import React, { useState } from 'react';
import { CheckSvg, UserPlusSvg, XSvg } from '@/assets/icons';
import { SPECIALTY_GROUPS } from '../../department/types/department.type';
import {
	EMPTY_EXTERNAL_REVIEWER_FORM,
	type ExternalReviewer,
	type ExternalReviewerForm,
} from '../types/council.type';
import styles from '../pages/Council.module.css';

export function ExternalReviewerFormModal({
	mode,
	reviewer,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	reviewer?: ExternalReviewer;
	onClose: () => void;
	onSave: (f: ExternalReviewerForm) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<ExternalReviewerForm>(
		reviewer
			? {
					full_name: reviewer.full_name,
					organization: reviewer.organization ?? '',
					specialty_group: reviewer.specialty_group ?? '',
					phone: reviewer.phone ?? '',
					email: reviewer.email ?? '',
					note: reviewer.note ?? '',
				}
			: EMPTY_EXTERNAL_REVIEWER_FORM,
	);
	const [errors, setErrors] = useState<Partial<ExternalReviewerForm>>({});

	const set =
		(k: keyof ExternalReviewerForm) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const validate = () => {
		const err: Partial<ExternalReviewerForm> = {};
		if (!form.full_name.trim()) err.full_name = 'Vui lòng nhập họ tên';
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
						<UserPlusSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>
							{mode === 'add' ? 'Thêm người ngoài viện' : 'Chỉnh sửa người ngoài viện'}
						</div>
						<div className={styles.modalSub}>
							Chuyên gia mời ngoài tham gia hội đồng chấm, không cần tài khoản đăng nhập
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
								Họ tên <span className={styles.required}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${errors.full_name ? styles.inputError : ''}`}
								value={form.full_name}
								onChange={set('full_name')}
								placeholder='VD: PGS.TS Nguyễn Văn A'
							/>
							{errors.full_name && (
								<div className={styles.fieldError}>{errors.full_name}</div>
							)}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Đơn vị công tác</label>
							<input
								className={styles.formInput}
								value={form.organization}
								onChange={set('organization')}
								placeholder='VD: BV Bạch Mai'
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Hệ chuyên môn</label>
							<select
								className={styles.formInput}
								value={form.specialty_group}
								onChange={set('specialty_group')}
							>
								<option value=''>-- Chưa gán hệ --</option>
								{SPECIALTY_GROUPS.map((g) => (
									<option
										key={g}
										value={g}
									>
										{g}
									</option>
								))}
							</select>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Số điện thoại</label>
							<input
								className={styles.formInput}
								value={form.phone}
								onChange={set('phone')}
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Email</label>
							<input
								className={styles.formInput}
								value={form.email}
								onChange={set('email')}
							/>
						</div>
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.formLabel}>Ghi chú</label>
							<textarea
								className={styles.formTextarea}
								value={form.note}
								onChange={set('note')}
								rows={2}
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
						{mode === 'add' ? 'Thêm' : 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}
