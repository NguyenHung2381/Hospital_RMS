import { FormField } from '@/shared/components/Input/FormField';
import { DatePicker, Modal, ModalActions } from '@/shared/components';
import React, { useId, useState } from 'react';
import { UserCheckSvg } from '@/assets/icons';
import { EMPTY_FORM, GENDER_OPTIONS, type Trainee, type TraineeFormData } from '../types/trainee.type';
import type { SimpleItem } from '../hooks/useTrainees';
import styles from '../pages/Trainees.module.css';
import m from '@/shared/components/Modal/Modal.module.css';
import { CfgField, CustomFields, useFormConfig, type CustomValues } from '@/shared/formConfig';
import { allowedOptions } from '@/shared/formConfig/allowedOptions';

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
	// id duy nhất cho từng ô — CfgField nối nhãn qua htmlFor
	const fieldUid = useId();
	const fid = (name: string) => `${fieldUid}-${name}`;

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
	// Nhãn / bắt buộc / giới hạn / trường tùy chỉnh theo Cấu hình form
	const cfg = useFormConfig('trainee', 'admin');
	const [custom, setCustom] = useState<CustomValues>(trainee?.custom ?? {});
	const [errors, setErrors] = useState<Record<string, string>>({});

	const set =
		(k: keyof TraineeFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const validate = () => {
		const err: Record<string, string> = cfg.validate({ ...form }, custom, { mode: mode === 'add' ? 'create' : 'edit' });
		if (!form.full_name.trim()) err.full_name ||= 'Vui lòng nhập họ tên';
		if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) err.email = 'Email không hợp lệ';
		if (form.national_id && !/^\d{9,12}$/.test(form.national_id))
			err.national_id = 'CCCD/CMND phải gồm 9-12 chữ số';
		setErrors(err);
		return !Object.values(err).some(Boolean);
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
					onConfirm={() => validate() && onSave({ ...form, custom })}
					loading={loading}
					confirmLabel={mode === 'add' ? 'Thêm học viên' : 'Lưu thay đổi'}
				/>
			}
		>
			<div className={styles.formGrid2}>
				<CfgField
					cfg={cfg}
					name='full_name' htmlFor={fid('full_name')}
					label='Họ và tên'
					required
					error={errors.full_name}
					style={{ gridColumn: '1 / -1' }}
				>
					<input id={fid('full_name')} aria-invalid={!!errors.full_name || undefined}
						className={`${styles.formInput} ${errors.full_name ? styles.inputError : ''}`}
						value={form.full_name}
						onChange={set('full_name')}
						placeholder='VD: Nguyễn Văn A'
					/>
				</CfgField>
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
				<CfgField cfg={cfg} name='dob' htmlFor={fid('dob')} error={errors.dob} label='Ngày sinh'>
					<DatePicker id={fid('dob')} aria-invalid={!!errors.dob || undefined} value={form.dob} onChange={(v) => setForm((f) => ({ ...f, dob: v }))} />
				</CfgField>
				<CfgField cfg={cfg} name='gender' htmlFor={fid('gender')} error={errors.gender} label='Giới tính'>
					<select id={fid('gender')} aria-invalid={!!errors.gender || undefined}
						className={styles.formInput}
						value={form.gender}
						onChange={set('gender')}
					>
						<option value=''>-- Chọn --</option>
						{allowedOptions(cfg, 'gender', GENDER_OPTIONS).map((g) => (
							<option
								key={g.value}
								value={g.value}
							>
								{g.label}
							</option>
						))}
					</select>
				</CfgField>
				<CfgField cfg={cfg} name='qualification' htmlFor={fid('qualification')} error={errors.qualification} label='Trình độ chuyên môn'>
					<input id={fid('qualification')} aria-invalid={!!errors.qualification || undefined}
						className={styles.formInput}
						value={form.qualification}
						onChange={set('qualification')}
						placeholder='VD: Cử nhân điều dưỡng'
					/>
				</CfgField>
				<CfgField
					cfg={cfg}
					name='national_id' htmlFor={fid('national_id')}
					label='Số CCCD/CMND'
					error={errors.national_id}
				>
					<input id={fid('national_id')} aria-invalid={!!errors.national_id || undefined}
						className={`${styles.formInput} ${errors.national_id ? styles.inputError : ''}`}
						value={form.national_id}
						onChange={set('national_id')}
						placeholder='VD: 038201012345'
					/>
				</CfgField>
				<CfgField cfg={cfg} name='national_id_issued_date' htmlFor={fid('national_id_issued_date')} error={errors.national_id_issued_date} label='Ngày cấp CCCD'>
					<DatePicker id={fid('national_id_issued_date')} aria-invalid={!!errors.national_id_issued_date || undefined} value={form.national_id_issued_date} onChange={(v) => setForm((f) => ({ ...f, national_id_issued_date: v }))} />
				</CfgField>
				<CfgField cfg={cfg} name='national_id_issued_place' htmlFor={fid('national_id_issued_place')} error={errors.national_id_issued_place} label='Nơi cấp CCCD'>
					<input id={fid('national_id_issued_place')} aria-invalid={!!errors.national_id_issued_place || undefined}
						className={styles.formInput}
						value={form.national_id_issued_place}
						onChange={set('national_id_issued_place')}
						placeholder='VD: Cục CSQLHC về TTXH'
					/>
				</CfgField>
				<CfgField cfg={cfg} name='phone' htmlFor={fid('phone')} error={errors.phone} label='Điện thoại'>
					<input id={fid('phone')} aria-invalid={!!errors.phone || undefined}
						className={styles.formInput}
						value={form.phone}
						onChange={set('phone')}
						placeholder='VD: 0912345678'
					/>
				</CfgField>
				<CfgField
					cfg={cfg}
					name='email' htmlFor={fid('email')}
					label='Email'
					error={errors.email}
				>
					<input id={fid('email')} aria-invalid={!!errors.email || undefined}
						className={`${styles.formInput} ${errors.email ? styles.inputError : ''}`}
						value={form.email}
						onChange={set('email')}
						placeholder='email@example.com'
					/>
				</CfgField>
				<CfgField cfg={cfg} name='trainee_type_id' htmlFor={fid('trainee_type_id')} error={errors.trainee_type_id} label='Đối tượng học viên'>
					<select id={fid('trainee_type_id')} aria-invalid={!!errors.trainee_type_id || undefined}
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
				</CfgField>
				<CfgField cfg={cfg} name='department_id' htmlFor={fid('department_id')} error={errors.department_id} label='Khoa / Phòng (nếu là nhân viên)'>
					<select id={fid('department_id')} aria-invalid={!!errors.department_id || undefined}
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
				</CfgField>
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
				<CfgField cfg={cfg} name='workplace' htmlFor={fid('workplace')} error={errors.workplace} label='Đơn vị công tác'>
					<input id={fid('workplace')} aria-invalid={!!errors.workplace || undefined}
						className={styles.formInput}
						value={form.workplace}
						onChange={set('workplace')}
						placeholder='VD: Bệnh viện Y học cổ truyền Nghệ An'
					/>
				</CfgField>
				<CfgField cfg={cfg} name='position' htmlFor={fid('position')} error={errors.position} label='Chức vụ'>
					<input id={fid('position')} aria-invalid={!!errors.position || undefined}
						className={styles.formInput}
						value={form.position}
						onChange={set('position')}
					/>
				</CfgField>
				<CfgField cfg={cfg} name='graduated_school' htmlFor={fid('graduated_school')} error={errors.graduated_school} label='Trường đào tạo'>
					<input id={fid('graduated_school')} aria-invalid={!!errors.graduated_school || undefined}
						className={styles.formInput}
						value={form.graduated_school}
						onChange={set('graduated_school')}
					/>
				</CfgField>
				<CfgField cfg={cfg} name='graduated_year' htmlFor={fid('graduated_year')} error={errors.graduated_year} label='Năm tốt nghiệp'>
					<input id={fid('graduated_year')} aria-invalid={!!errors.graduated_year || undefined}
						type='number'
						className={styles.formInput}
						value={form.graduated_year}
						onChange={set('graduated_year')}
						placeholder='VD: 2025'
					/>
				</CfgField>
				<CfgField cfg={cfg} name='graduated_date' htmlFor={fid('graduated_date')} error={errors.graduated_date} label='Ngày tốt nghiệp'>
					<DatePicker id={fid('graduated_date')} aria-invalid={!!errors.graduated_date || undefined} value={form.graduated_date} onChange={(v) => setForm((f) => ({ ...f, graduated_date: v }))} />
				</CfgField>
				<CfgField cfg={cfg} name='degree_issued_date' htmlFor={fid('degree_issued_date')} error={errors.degree_issued_date} label='Ngày cấp bằng'>
					<DatePicker id={fid('degree_issued_date')} aria-invalid={!!errors.degree_issued_date || undefined} value={form.degree_issued_date} onChange={(v) => setForm((f) => ({ ...f, degree_issued_date: v }))} />
				</CfgField>
				<CfgField cfg={cfg} name='birth_province' htmlFor={fid('birth_province')} error={errors.birth_province} label='Nơi sinh (tỉnh)'>
					<input id={fid('birth_province')} aria-invalid={!!errors.birth_province || undefined}
						className={styles.formInput}
						value={form.birth_province}
						onChange={set('birth_province')}
						placeholder='VD: Nghệ An'
					/>
				</CfgField>
				<CfgField
					cfg={cfg}
					name='legacy_code' htmlFor={fid('legacy_code')}
					error={errors.legacy_code}
					label='Mã học viên (sổ cũ)'
				>
					<input id={fid('legacy_code')} aria-invalid={!!errors.legacy_code || undefined}
						className={styles.formInput}
						value={form.legacy_code}
						onChange={set('legacy_code')}
						placeholder='VD: 226'
					/>
				</CfgField>
				<CfgField cfg={cfg} name='address' htmlFor={fid('address')} error={errors.address} label='Địa chỉ'>
					<input id={fid('address')} aria-invalid={!!errors.address || undefined}
						className={styles.formInput}
						value={form.address}
						onChange={set('address')}
						placeholder='Địa chỉ liên hệ...'
					/>
				</CfgField>
				<CfgField cfg={cfg} name='permanent_address' htmlFor={fid('permanent_address')} error={errors.permanent_address} label='Địa chỉ thường trú'>
					<input id={fid('permanent_address')} aria-invalid={!!errors.permanent_address || undefined}
						className={styles.formInput}
						value={form.permanent_address}
						onChange={set('permanent_address')}
						placeholder='Địa chỉ thường trú...'
					/>
				</CfgField>
				<CfgField
					cfg={cfg}
					name='notes' htmlFor={fid('notes')}
					error={errors.notes}
					label='Ghi chú'
					style={{ gridColumn: '1 / -1' }}
				>
					<textarea id={fid('notes')} aria-invalid={!!errors.notes || undefined}
						className={styles.formInput}
						rows={3}
						value={form.notes}
						onChange={set('notes')}
						placeholder='Ghi chú thêm (nếu có)...'
					/>
				</CfgField>
				<CustomFields
					cfg={cfg}
					value={custom}
					onChange={setCustom}
					errors={errors}
					sectionClassName={m.formSectionTitle}
					inputClassName={styles.formInput}
				/>
			</div>
		</Modal>
	);
}
