import { useId } from 'react';
import type { FormConfig } from '@/shared/formConfig/useFormConfig';
import { withChoices } from '@/shared/formConfig/withChoices';
import type { SimpleOption } from '../api/publicApi';
import type { PersonField, TopicPerson } from '../utils/topicPerson';
import styles from '../pages/PublicPortal.module.css';
import { SubGroup } from './FormSection';

interface Props {
	person: TopicPerson;
	errors?: Partial<Record<PersonField, string>>;
	departments: SimpleOption[];
	/** Đã có thư ký ở người khác ⇒ khóa lựa chọn "Thư ký" */
	secretaryTaken?: boolean;
	onChange: (field: PersonField, value: string) => void;
	/** Chỉ truyền cho chủ nhiệm: nhãn / bắt buộc / ẩn theo Cấu hình form */
	cfg?: FormConfig;
}

export function TopicPersonFields({ person, errors = {}, departments, secretaryTaken, onChange, cfg }: Props) {
	// Mỗi người tham gia là một khối riêng nên id phải khác nhau giữa các khối
	const uid = useId();
	const input = (
		field: PersonField,
		label: string,
		opts: { required?: boolean; placeholder?: string; type?: string } = {},
	) => {
		if (cfg && !cfg.visible(field)) return null;
		const required = cfg ? cfg.required(field, opts.required) : opts.required;
		const hint = cfg?.hint(field);
		const id = `${uid}-${field}`;
		const describedBy = [hint ? `${id}-hint` : '', errors[field] ? `${id}-error` : ''].filter(Boolean).join(' ');
		return (
			<div className={styles.formGroup}>
				<label
					className={styles.label}
					htmlFor={id}
				>
					{cfg ? cfg.label(field, label) : label} {required && <span className={styles.required}>*</span>}
				</label>
				{withChoices(
					cfg?.field(field),
					<input
						id={id}
						aria-required={required || undefined}
						aria-invalid={errors[field] ? true : undefined}
						aria-describedby={describedBy || undefined}
						type={opts.type ?? 'text'}
						className={`${styles.input} ${errors[field] ? styles.inputError : ''}`}
						placeholder={cfg ? cfg.placeholder(field, opts.placeholder) : opts.placeholder}
						maxLength={cfg?.maxLength(field)}
						value={person[field]}
						onChange={(e) => onChange(field, e.target.value)}
					/>,
				)}
				{hint && (
					<span
						id={`${id}-hint`}
						className={styles.fieldHint}
					>
						{hint}
					</span>
				)}
				{errors[field] && (
					<span
						id={`${id}-error`}
						className={styles.fieldError}
						role='alert'
					>
						{errors[field]}
					</span>
				)}
			</div>
		);
	};

	return (
		<>
			<SubGroup title='Thông tin cá nhân'>
				<div className={styles.formGrid}>
					{input('full_name', 'Họ và tên', {
						required: true,
						placeholder: 'VD: Nguyễn Văn An',
					})}
					{input('staff_number', 'Mã nhân viên (MNV)', {
						required: true,
						placeholder: 'VD: 0123',
					})}
					{input('position', 'Chức danh chuyên môn', {
						required: true,
						placeholder: 'Bác sĩ, Điều dưỡng...',
					})}
					<div className={styles.formGroup}>
						<label
							className={styles.label}
							htmlFor={`${uid}-role`}
						>
							Vai trò trong đề tài
						</label>
						{person.role === 'leader' ? (
							<input
								id={`${uid}-role`}
								className={styles.input}
								value='Chủ nhiệm đề tài'
								disabled
							/>
						) : (
							<select
								id={`${uid}-role`}
								className={styles.select}
								value={person.role}
								onChange={(e) => onChange('role', e.target.value)}
							>
								<option
									value='secretary'
									disabled={secretaryTaken}
								>
									Thư ký
								</option>
								<option value='member'>Thành viên</option>
							</select>
						)}
					</div>
					<div className={`${styles.formGroup} ${styles.full}`}>
						<label
							className={styles.label}
							htmlFor={`${uid}-department_id`}
						>
							Khoa/phòng công tác
						</label>
						<select
							id={`${uid}-department_id`}
							className={styles.select}
							value={person.department_id}
							onChange={(e) => onChange('department_id', e.target.value)}
						>
							<option value=''>-- Như khoa/phòng của đề tài --</option>
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
				</div>
			</SubGroup>
			<SubGroup title='Thông tin liên hệ'>
				<div className={styles.formGrid}>
					{input('phone', 'Số điện thoại', {
						required: true,
						placeholder: 'VD: 0912345678',
						type: 'tel',
					})}
					{input('email', 'Email', {
						placeholder: 'email@hospital.vn',
						type: 'email',
					})}
				</div>
			</SubGroup>
		</>
	);
}
