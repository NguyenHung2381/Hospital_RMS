import React, { useState } from 'react';
import { CheckSvg, InfoSvg, ShieldSvg, TrashSvg, XSvg } from '@/assets/icons';
import { EMPTY_FORM, type Role, type RoleFormData } from '../types/role.type';
import styles from '../pages/Roles.module.css';

interface RoleFormModalProps {
	mode: 'add' | 'edit';
	role?: Role;
	onClose: () => void;
	onSave: (data: RoleFormData) => void;
	loading: boolean;
}

export function RoleFormModal({
	mode,
	role,
	onClose,
	onSave,
	loading,
}: RoleFormModalProps) {
	const [form, setForm] = useState<RoleFormData>(
		role
			? { name: role.name, description: role.description ?? '' }
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<RoleFormData>>({});

	const set =
		(k: keyof RoleFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const validate = () => {
		const err: Partial<RoleFormData> = {};
		if (!form.name.trim()) err.name = 'Vui lòng nhập tên vai trò';
		else if (form.name.trim().length < 2)
			err.name = 'Tên vai trò ít nhất 2 ký tự';
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
						<ShieldSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>
							{mode === 'add' ? 'Thêm vai trò mới' : 'Chỉnh sửa vai trò'}
						</div>
						<div className={styles.modalSub}>
							{mode === 'add'
								? 'Tạo vai trò mới để phân quyền người dùng'
								: `Cập nhật — ${role?.id}`}
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
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>
							Tên vai trò <span className={styles.required}>*</span>
						</label>
						<input
							className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
							value={form.name}
							onChange={set('name')}
							placeholder='VD: Bác sĩ điều trị, Trưởng khoa...'
							autoFocus
						/>
						{errors.name && (
							<div className={styles.fieldError}>{errors.name}</div>
						)}
					</div>

					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Mô tả</label>
						<textarea
							className={styles.formTextarea}
							value={form.description}
							onChange={set('description')}
							rows={3}
							placeholder='Mô tả ngắn về vai trò và trách nhiệm...'
						/>
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
						className={styles.btnSave}
						onClick={() => validate() && onSave(form)}
						disabled={loading}
					>
						{loading ? <span className={styles.spinner} /> : <CheckSvg />}
						{mode === 'add' ? 'Thêm vai trò' : 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}

interface RoleDeleteModalProps {
	role: Role;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}

export function RoleDeleteModal({
	role,
	onClose,
	onConfirm,
	loading,
}: RoleDeleteModalProps) {
	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalSm}`}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIconDanger}>
						<TrashSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>Xoá vai trò</div>
						<div className={styles.modalSub}>{role.name}</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>

				<div className={styles.modalBody}>
					<p className={styles.deleteDesc}>
						Bạn có chắc muốn xoá vai trò <strong>"{role.name}"</strong>? Tất cả
						phân quyền liên kết cũng sẽ bị xoá. Hành động này không thể hoàn
						tác.
					</p>
					{(role.user_count ?? 0) > 0 && (
						<div className={styles.warnBox}>
							<InfoSvg />
							<span>
								Có <strong>{role.user_count} người dùng</strong> đang sử dụng
								vai trò này và sẽ bị mất vai trò sau khi xoá.
							</span>
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
						className={styles.btnDanger}
						onClick={onConfirm}
						disabled={loading}
					>
						{loading ? (
							<span className={`${styles.spinner} ${styles.spinnerDark}`} />
						) : (
							<TrashSvg />
						)}
						Xác nhận xoá
					</button>
				</div>
			</div>
		</div>
	);
}
