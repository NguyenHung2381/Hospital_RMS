import {
	CheckSvg,
	ChevDSvg,
	EditSvg,
	MailSvg,
	PhoneSvg,
	PlusSvg,
	XSvg,
} from '@/assets/icons';
import { useState } from 'react';
import styles from '../pages/TopicMembers.module.css';
import type {
	MemberFormData,
	MemberRole,
	TopicMember,
} from '../types/topicmember.type';
import { EMPTY_FORM, ROLE_CFG } from '../utils/memberHelpers';

interface MemberFormModalProps {
	mode: 'add' | 'edit';
	member?: TopicMember;
	onClose: () => void;
	onSave: (data: MemberFormData) => void;
	loading: boolean;
}

export function MemberFormModal({
	mode,
	member,
	onClose,
	onSave,
	loading,
}: MemberFormModalProps) {
	const [form, setForm] = useState<MemberFormData>(
		member
			? {
					ho_ten: member.ho_ten,
					email: member.email,
					so_dien_thoai: member.so_dien_thoai ?? '',
					chuc_vu: member.chuc_vu ?? '',
					staff_number: member.staff_number ?? '',
					role: member.role,
				}
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<MemberFormData>>({});

	const set = (k: keyof MemberFormData, v: string) => {
		setForm((f) => ({ ...f, [k]: v }));
		setErrors((e) => ({ ...e, [k]: undefined }));
	};

	const validate = () => {
		const e: Partial<MemberFormData> = {};
		if (!form.ho_ten.trim()) e.ho_ten = 'Vui lòng nhập họ tên';
		if (!form.email.trim()) e.email = 'Vui lòng nhập email';
		else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
			e.email = 'Email không hợp lệ';
		setErrors(e);
		return Object.keys(e).length === 0;
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={onClose}
		>
			<div
				className={styles.modal}
				onClick={(e) => e.stopPropagation()}
			>
				<div className={styles.modalHeader}>
					<div
						className={styles.modalHeaderIcon}
						style={{
							background:
								mode === 'add' ? 'var(--color-primary-pale)' : '#e6f1fb',
							color: mode === 'add' ? 'var(--color-primary-dark)' : '#0c447c',
						}}
					>
						{mode === 'add' ? <PlusSvg /> : <EditSvg />}
					</div>
					<div>
						<div className={styles.modalTitle}>
							{mode === 'add' ? 'Thêm thành viên mới' : 'Cập nhật thông tin'}
						</div>
						<div className={styles.modalSubtitle}>
							{mode === 'add'
								? 'Điền đầy đủ thông tin thành viên'
								: 'Chỉnh sửa thông tin thành viên'}
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
					<div className={styles.formGrid}>
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.formLabel}>
								Họ và tên <span className={styles.required}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${errors.ho_ten ? styles.inputError : ''}`}
								placeholder='VD: BS. Nguyễn Văn A'
								value={form.ho_ten}
								onChange={(e) => set('ho_ten', e.target.value)}
							/>
							{errors.ho_ten && (
								<span className={styles.fieldError}>{errors.ho_ten}</span>
							)}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Email <span className={styles.required}>*</span>
							</label>
							<div className={styles.inputWithIcon}>
								<MailSvg />
								<input
									className={`${styles.formInput} ${styles.inputHasIcon} ${errors.email ? styles.inputError : ''}`}
									placeholder='example@bvnghe.vn'
									value={form.email}
									onChange={(e) => set('email', e.target.value)}
								/>
							</div>
							{errors.email && (
								<span className={styles.fieldError}>{errors.email}</span>
							)}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Số điện thoại</label>
							<div className={styles.inputWithIcon}>
								<PhoneSvg />
								<input
									className={`${styles.formInput} ${styles.inputHasIcon}`}
									placeholder='0912 345 678'
									value={form.so_dien_thoai}
									onChange={(e) => set('so_dien_thoai', e.target.value)}
								/>
							</div>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Chức vụ / Học hàm</label>
							<input
								className={styles.formInput}
								placeholder='VD: Trưởng khoa, ThS., PGS.TS.'
								value={form.chuc_vu}
								onChange={(e) => set('chuc_vu', e.target.value)}
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Mã nhân viên</label>
							<input
								className={styles.formInput}
								placeholder='VD: 12345'
								value={form.staff_number}
								onChange={(e) => set('staff_number', e.target.value)}
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Vai trò trong đề tài <span className={styles.required}>*</span>
							</label>
							<div className={styles.selectWrapper}>
								<select
									className={styles.formSelect}
									value={form.role}
									onChange={(e) => set('role', e.target.value as MemberRole)}
								>
									{(
										Object.entries(ROLE_CFG) as [
											MemberRole,
											(typeof ROLE_CFG)[MemberRole],
										][]
									).map(([k, v]) => (
										<option
											key={k}
											value={k}
										>
											{v.label}
										</option>
									))}
								</select>
								<ChevDSvg />
							</div>
						</div>
					</div>
				</div>

				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
					>
						Huỷ
					</button>
					<button
						className={
							mode === 'add' ? styles.btnConfirmApprove : styles.btnConfirmBlue
						}
						onClick={() => {
							if (validate()) onSave(form);
						}}
						disabled={loading}
					>
						{loading ? (
							<>
								<span className={styles.spinner} /> Đang lưu...
							</>
						) : mode === 'add' ? (
							<>
								<PlusSvg /> Thêm thành viên
							</>
						) : (
							<>
								<CheckSvg /> Lưu thay đổi
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
