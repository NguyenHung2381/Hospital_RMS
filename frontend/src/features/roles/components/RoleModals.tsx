import { FormField } from '@/shared/components/Input/FormField';
import { Modal } from '@/shared/components';
import React, { useState } from 'react';
import { CheckSvg, InfoSvg, ShieldSvg, TrashSvg } from '@/assets/icons';
import { EMPTY_FORM, type Role, type RoleFormData } from '../types/role.type';
import styles from '../pages/Roles.module.css';

interface RoleFormModalProps {
	/** 'clone': tạo vai trò mới mang đúng quyền của `role` (vai trò nguồn) */
	mode: 'add' | 'edit' | 'clone';
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
			? {
					name: mode === 'clone' ? `${role.name} (bản sao)` : role.name,
					description: role.description ?? '',
				}
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
		<Modal
			open
			onClose={onClose}
			icon={<ShieldSvg />}
			title={mode === 'add' ? 'Thêm vai trò mới' : mode === 'clone' ? 'Nhân bản vai trò' : 'Chỉnh sửa vai trò'}
			subtitle={mode === 'add' ? 'Tạo vai trò mới để phân quyền người dùng' : mode === 'clone' ? `Vai trò mới mang đúng quyền & phạm vi của "${role?.name}"` : `Cập nhật — ${role?.id}`}
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<>
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
						{mode === 'add' ? 'Thêm vai trò' : mode === 'clone' ? 'Nhân bản' : 'Lưu thay đổi'}
					</button>
				</>
			}
		>
			<FormField
				label='Tên vai trò'
				required
				error={errors.name}
			>
				<input
					className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
					value={form.name}
					onChange={set('name')}
					placeholder='VD: Bác sĩ điều trị, Trưởng khoa...'
					autoFocus
				/>
			</FormField>

			<FormField label='Mô tả'>
				<textarea
					className={styles.formTextarea}
					value={form.description}
					onChange={set('description')}
					rows={3}
					placeholder='Mô tả ngắn về vai trò và trách nhiệm...'
				/>
			</FormField>
		</Modal>
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
		<Modal
			open
			onClose={onClose}
			icon={<TrashSvg />}
			tone='danger'
			title='Xoá vai trò'
			subtitle={role.name}
			className={`${styles.modal} ${styles.modalSm}`}
			bodyClassName={styles.modalBody}
			footer={
				<>
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
				</>
			}
		>
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
		</Modal>
	);
}
