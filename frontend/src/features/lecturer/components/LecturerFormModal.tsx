import { FormField } from '@/shared/components/Input/FormField';
import { Modal, ModalActions } from '@/shared/components';
import React, { useState } from 'react';
import { UserCheckSvg } from '@/assets/icons';
import { formatDateOr } from '@/shared/utils';
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
		<Modal
			open
			onClose={onClose}
			icon={<UserCheckSvg />}
			title={mode === 'add' ? 'Thêm giảng viên' : 'Chỉnh sửa giảng viên'}
			subtitle={mode === 'add' ? 'Thêm giảng viên mới vào hệ thống' : `Cập nhật — ${lecturer?.full_name}`}
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={() => validate() && onSave(form)}
					loading={loading}
					confirmLabel={mode === 'add' ? 'Thêm giảng viên' : 'Lưu thay đổi'}
				/>
			}
		>
			<div className={styles.formGrid2}>
				<FormField
					label='Họ và tên'
					required
					error={errors.full_name}
					style={{ gridColumn: '1 / -1' }}
				>
					<input
						className={`${styles.formInput} ${errors.full_name ? styles.inputError : ''}`}
						value={form.full_name}
						onChange={set('full_name')}
						placeholder='VD: BS. Nguyễn Văn A'
					/>
				</FormField>
				<FormField label='Chuyên môn'>
					<input
						className={styles.formInput}
						value={form.specialty}
						onChange={set('specialty')}
						placeholder='VD: Hồi sức cấp cứu'
					/>
				</FormField>
				<FormField label='Điện thoại'>
					<input
						className={styles.formInput}
						value={form.phone}
						onChange={set('phone')}
						placeholder='VD: 0912345678'
					/>
				</FormField>
				<FormField
					label='Email'
					error={errors.email}
				>
					<input
						className={`${styles.formInput} ${errors.email ? styles.inputError : ''}`}
						value={form.email}
						onChange={set('email')}
						placeholder='email@benhvien.vn'
					/>
				</FormField>
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
				{lecturer?.user_id && (
					<div
						className={styles.licenseBox}
						style={{ gridColumn: '1 / -1' }}
					>
						<div className={styles.licenseTitle}>
							Chứng chỉ hành nghề{lecturer.staff_number ? ` — MNV ${lecturer.staff_number}` : ''}
						</div>
						{lecturer.license_no ? (
							<dl className={styles.licenseGrid}>
								<dt>Số CCHN</dt>
								<dd>{lecturer.license_no}</dd>
								<dt>Ngày cấp</dt>
								<dd>
									{formatDateOr(lecturer.license_issued_date)}
									{lecturer.license_issuing_authority ? ` — ${lecturer.license_issuing_authority}` : ''}
								</dd>
								<dt>Phạm vi</dt>
								<dd>{lecturer.license_practice_scope ?? '—'}</dd>
							</dl>
						) : (
							<div className={styles.descText}>Tài khoản liên kết chưa có hồ sơ CCHN.</div>
						)}
						<div className={styles.descText}>
							Chỉ đọc — sửa ở màn Chứng chỉ hành nghề hoặc nhập lại file "Danh sách người hành nghề".
						</div>
					</div>
				)}
			</div>
		</Modal>
	);
}
