import type { SimpleOption } from '../api/publicApi';
import type { PersonField, TopicPerson } from '../utils/topicPerson';
import styles from '../pages/PublicPortal.module.css';
import { SubGroup } from './FormSection';

interface Props {
	person: TopicPerson;
	errors?: Partial<Record<PersonField, string>>;
	departments: SimpleOption[];
	/** Đã có thư ký ở người khác ⇒ khoá lựa chọn "Thư ký" */
	secretaryTaken?: boolean;
	onChange: (field: PersonField, value: string) => void;
}

export function TopicPersonFields({ person, errors = {}, departments, secretaryTaken, onChange }: Props) {
	const input = (
		field: PersonField,
		label: string,
		opts: { required?: boolean; placeholder?: string; type?: string } = {},
	) => (
		<div className={styles.formGroup}>
			<label className={styles.label}>
				{label} {opts.required && <span className={styles.required}>*</span>}
			</label>
			<input
				type={opts.type ?? 'text'}
				className={`${styles.input} ${errors[field] ? styles.inputError : ''}`}
				placeholder={opts.placeholder}
				value={person[field]}
				onChange={(e) => onChange(field, e.target.value)}
			/>
			{errors[field] && <span className={styles.fieldError}>{errors[field]}</span>}
		</div>
	);

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
						<label className={styles.label}>Vai trò trong đề tài</label>
						{person.role === 'leader' ? (
							<input
								className={styles.input}
								value='Chủ nhiệm đề tài'
								disabled
							/>
						) : (
							<select
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
						<label className={styles.label}>Khoa/phòng công tác</label>
						<select
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
