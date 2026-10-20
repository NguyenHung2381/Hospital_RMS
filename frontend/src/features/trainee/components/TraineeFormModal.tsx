import { FormField } from '@/shared/components/Input/FormField';
import { Modal, ModalActions } from '@/shared/components';
import React, { useState } from 'react';
import { UserCheckSvg } from '@/assets/icons';
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
					permanent_address: trainee.permanent_address ?? '',
					trainee_type_id: trainee.trainee_type_id ?? '',
					department_id: trainee.department_id ?? '',
					national_id_issued_date: trainee.national_id_issued_date ?? '',
					national_id_issued_place: trainee.national_id_issued_place ?? '',
					graduated_school: trainee.graduated_school ?? '',
					graduated_year: trainee.graduated_year != null ? String(trainee.graduated_year) : '',
					workplace: trainee.workplace ?? '',
					position: trainee.position ?? '',
					qualification: trainee.qualification ?? '',
					notes: trainee.notes ?? '',
					birth_province: trainee.birth_province ?? '',
					graduated_date: trainee.graduated_date?.slice(0, 10) ?? '',
					degree_issued_date: trainee.degree_issued_date?.slice(0, 10) ?? '',
					legacy_code: trainee.legacy_code ?? '',
					is_active: trainee.is_active,
					is_employee: trainee.is_employee,
				}
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<Record<keyof TraineeFormData, string>>>({});

	const set =
		(k: keyof TraineeFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
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
		<Modal
			open
			onClose={onClose}
			icon={<UserCheckSvg />}
			title={mode === 'add' ? 'Thêm học viên' : 'Chỉnh sửa học viên'}
			subtitle={mode === 'add' ? 'Thêm hồ sơ học viên mới' : `Cập nhật — ${trainee?.full_name}`}
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={() => validate() && onSave(form)}
					loading={loading}
					confirmLabel={mode === 'add' ? 'Thêm học viên' : 'Lưu thay đổi'}
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
						placeholder='VD: Nguyễn Văn A'
					/>
				</FormField>
				<FormField label='Trạng thái'>
					<select
						className={styles.formInput}
						value={form.is_active ? '1' : '0'}
						onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === '1' }))}
					>
						<option value='1'>Hoạt động</option>
						<option value='0'>Ngừng hoạt động</option>
					</select>
				</FormField>
				<FormField label='Ngày sinh'>
					<input
						type='date'
						className={styles.formInput}
						value={form.dob}
						onChange={set('dob')}
					/>
				</FormField>
				<FormField label='Giới tính'>
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
				</FormField>
				<FormField label='Trình độ chuyên môn'>
					<input
						className={styles.formInput}
						value={form.qualification}
						onChange={set('qualification')}
						placeholder='VD: Cử nhân điều dưỡng'
					/>
				</FormField>
				<FormField
					label='Số CCCD/CMND'
					error={errors.national_id}
				>
					<input
						className={`${styles.formInput} ${errors.national_id ? styles.inputError : ''}`}
						value={form.national_id}
						onChange={set('national_id')}
						placeholder='VD: 038201012345'
					/>
				</FormField>
				<FormField label='Ngày cấp CCCD'>
					<input
						type='date'
						className={styles.formInput}
						value={form.national_id_issued_date}
						onChange={set('national_id_issued_date')}
					/>
				</FormField>
				<FormField label='Nơi cấp CCCD'>
					<input
						className={styles.formInput}
						value={form.national_id_issued_place}
						onChange={set('national_id_issued_place')}
						placeholder='VD: Cục CSQLHC về TTXH'
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
						placeholder='email@example.com'
					/>
				</FormField>
				<FormField label='Đối tượng học viên'>
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
				</FormField>
				<FormField label='Khoa / Phòng (nếu là nhân viên)'>
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
				</FormField>
				<div className={styles.formGroup}>
					<label className={styles.checkboxRow}>
						<input
							type='checkbox'
							checked={form.is_employee}
							onChange={(e) => setForm((f) => ({ ...f, is_employee: e.target.checked }))}
						/>
						Là nhân viên của bệnh viện
					</label>
				</div>
				<FormField label='Đơn vị công tác'>
					<input
						className={styles.formInput}
						value={form.workplace}
						onChange={set('workplace')}
						placeholder='VD: Bệnh viện Y học cổ truyền Nghệ An'
					/>
				</FormField>
				<FormField label='Chức vụ'>
					<input
						className={styles.formInput}
						value={form.position}
						onChange={set('position')}
					/>
				</FormField>
				<FormField label='Trường đào tạo'>
					<input
						className={styles.formInput}
						value={form.graduated_school}
						onChange={set('graduated_school')}
					/>
				</FormField>
				<FormField label='Năm tốt nghiệp'>
					<input
						type='number'
						className={styles.formInput}
						value={form.graduated_year}
						onChange={set('graduated_year')}
						placeholder='VD: 2025'
					/>
				</FormField>
				<FormField label='Ngày tốt nghiệp'>
					<input
						type='date'
						className={styles.formInput}
						value={form.graduated_date}
						onChange={set('graduated_date')}
					/>
				</FormField>
				<FormField label='Ngày cấp bằng'>
					<input
						type='date'
						className={styles.formInput}
						value={form.degree_issued_date}
						onChange={set('degree_issued_date')}
					/>
				</FormField>
				<FormField label='Nơi sinh (tỉnh)'>
					<input
						className={styles.formInput}
						value={form.birth_province}
						onChange={set('birth_province')}
						placeholder='VD: Nghệ An'
					/>
				</FormField>
				<FormField
					label='Mã học viên (sổ cũ)'
				>
					<input
						className={styles.formInput}
						value={form.legacy_code}
						onChange={set('legacy_code')}
						placeholder='VD: 226'
					/>
				</FormField>
				<FormField label='Địa chỉ'>
					<input
						className={styles.formInput}
						value={form.address}
						onChange={set('address')}
						placeholder='Địa chỉ liên hệ...'
					/>
				</FormField>
				<FormField label='Địa chỉ thường trú'>
					<input
						className={styles.formInput}
						value={form.permanent_address}
						onChange={set('permanent_address')}
						placeholder='Địa chỉ thường trú...'
					/>
				</FormField>
				<FormField
					label='Ghi chú'
					style={{ gridColumn: '1 / -1' }}
				>
					<textarea
						className={styles.formInput}
						rows={3}
						value={form.notes}
						onChange={set('notes')}
						placeholder='Ghi chú thêm (nếu có)...'
					/>
				</FormField>
			</div>
		</Modal>
	);
}
