import type { FormErrors, RoundForm, RoundStatus } from '../types/round.type';
import { STATUS_CFG, STATUS_OPTIONS, fromInputDate, toInputDate } from '../utils/roundHelpers';
import { FormField } from './DeadlineManager';
import styles from '../pages/Round.module.css';

interface RoundInfoTabProps {
	form: RoundForm;
	errors: FormErrors;
	set: <K extends keyof RoundForm>(field: K, val: RoundForm[K]) => void;
	duplicateRound: boolean;
	years: number[];
}

export function RoundInfoTab({ form, errors, set, duplicateRound, years }: RoundInfoTabProps) {
	return (
		<>
			<div className={styles.formSection}>Thông tin đợt nghiên cứu</div>
			<div className={styles.formRow}>
				<FormField
					id='year'
					label='Năm'
					required
					error={errors.year as string}
				>
					<select
						id='year'
						className={styles.formSelect}
						value={form.year}
						onChange={(e) => set('year', Number(e.target.value))}
					>
						{years.map((y) => (
							<option
								key={y}
								value={y}
							>
								{y}
							</option>
						))}
					</select>
				</FormField>
				<FormField
					id='round_number'
					label='Số đợt trong năm'
					required
					error={
						duplicateRound
							? `Đợt ${form.round_number} năm ${form.year} đã tồn tại`
							: errors.round_number
					}
				>
					<input
						id='round_number'
						type='number'
						min={1}
						max={99}
						className={`${styles.formInput} ${duplicateRound ? styles.hasError : ''}`}
						value={form.round_number}
						onChange={(e) => set('round_number', Number(e.target.value))}
					/>
				</FormField>
			</div>
			<FormField
				id='name'
				label='Tên đợt nghiên cứu'
				required
				error={errors.name}
				hint='Có thể chỉnh sửa tên tự sinh'
			>
				<input
					id='name'
					className={`${styles.formInput} ${errors.name ? styles.hasError : ''}`}
					placeholder='VD: Đợt 1 năm 2026'
					value={form.name}
					onChange={(e) => set('name', e.target.value)}
				/>
			</FormField>
			<div className={styles.formSection}>Thời gian thực hiện</div>
			<div className={styles.formRow}>
				<FormField
					id='start_date'
					label='Ngày bắt đầu'
					required
					error={errors.start_date}
				>
					<input
						id='start_date'
						type='date'
						className={`${styles.formInput} ${errors.start_date ? styles.hasError : ''}`}
						value={toInputDate(form.start_date)}
						onChange={(e) =>
							set('start_date', fromInputDate(e.target.value))
						}
					/>
				</FormField>
				<FormField
					id='end_date'
					label='Ngày kết thúc'
					required
					error={errors.end_date}
				>
					<input
						id='end_date'
						type='date'
						className={`${styles.formInput} ${errors.end_date ? styles.hasError : ''}`}
						value={toInputDate(form.end_date)}
						onChange={(e) =>
							set('end_date', fromInputDate(e.target.value))
						}
					/>
				</FormField>
			</div>
			<div className={styles.formSection}>Trạng thái đợt</div>
			<div className={styles.statusSelector}>
				{STATUS_OPTIONS.map(({ value, label, desc }) => {
					const cfg = STATUS_CFG[value];
					return (
						<button
							key={value}
							type='button'
							className={`${styles.statusOption} ${form.status === value ? styles.statusOptionSelected : ''}`}
							onClick={() => set('status', value as RoundStatus)}
						>
							<span
								className={`${styles.badge} ${styles[cfg.cls as keyof typeof styles]}`}
							>
								<span className={styles.badgeDot} />
								{label}
							</span>
							<span className={styles.statusOptionDesc}>{desc}</span>
						</button>
					);
				})}
			</div>
		</>
	);
}
