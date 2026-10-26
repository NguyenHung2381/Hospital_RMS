import { useEffect, useState } from 'react';
import { getAllLevels } from '../api/roundApi';
import type {
	FormErrors,
	LevelOption,
	RoundForm,
	RoundStatus,
	RoundType,
} from '../types/round.type';
import { STATUS_CFG, STATUS_OPTIONS, fromInputDate, toInputDate } from '../utils/roundHelpers';
import { FormField } from '@/shared/components/Input/FormField';
import { DeadlineManager } from './DeadlineManager';
import dmStyles from './DeadlineManager.module.css';
import styles from '../pages/Round.module.css';
import { Badge } from '@/shared/components';
import { DatePicker } from '../../../shared/components/Input/DatePicker';

interface RoundInfoTabProps {
	form: RoundForm;
	errors: FormErrors;
	set: <K extends keyof RoundForm>(field: K, val: RoundForm[K]) => void;
	duplicateRound: boolean;
	years: number[];
	roundTypes: RoundType[];
	/** Tạo mới: nhập luôn các mốc thời gian (lưu cùng lúc tạo đợt). */
	showDeadlines?: boolean;
}

export function RoundInfoTab({
	form,
	errors,
	set,
	duplicateRound,
	years,
	roundTypes,
	showDeadlines,
}: RoundInfoTabProps) {
	const [levels, setLevels] = useState<LevelOption[]>([]);
	useEffect(() => {
		getAllLevels()
			.then(setLevels)
			.catch(() => setLevels([]));
	}, []);


	return (
		<>
			<div className={styles.formSection}>Thông tin đợt nghiên cứu</div>
			<div className={styles.formRow}>
				<FormField
					htmlFor='year'
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
					htmlFor='round_number'
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
				htmlFor='round_type_id'
				label='Loại đợt'
				required
				error={errors.round_type_id as string}
			>
				<select
					id='round_type_id'
					className={`${styles.formSelect} ${errors.round_type_id ? styles.hasError : ''}`}
					aria-invalid={errors.round_type_id ? true : undefined}
					value={form.round_type_id}
					onChange={(e) => set('round_type_id', e.target.value)}
				>
					<option value=''>— Chọn loại đợt —</option>
					{roundTypes.map((t) => (
						<option
							key={t.id}
							value={t.id}
						>
							{t.name}
						</option>
					))}
				</select>
			</FormField>
			<FormField
				htmlFor='level_ids'
				label='Cấp độ đề tài của đợt'
				required
				error={errors.level_ids as string}
			>
				{/* Mỗi đợt đúng 1 cấp độ — mọi đề tài trong đợt lấy cấp độ này */}
				<select
					id='level_ids'
					className={`${styles.formSelect} ${errors.level_ids ? styles.hasError : ''}`}
					value={form.level_ids.length === 1 ? form.level_ids[0] : ''}
					onChange={(e) => set('level_ids', e.target.value ? [e.target.value] : [])}
				>
					<option value=''>
						{levels.length === 0 ? 'Chưa có cấp độ nào trong danh mục' : '-- Chọn cấp độ --'}
					</option>
					{levels.map((lv) => (
						<option
							key={lv.id}
							value={lv.id}
						>
							{lv.name}
						</option>
					))}
				</select>
				{form.level_ids.length > 1 && (
					<span className={styles.formHint}>
						Đợt đang có {form.level_ids.length} cấp độ (cấu hình cũ) — chọn lại 1 cấp độ.
					</span>
				)}
			</FormField>
			<FormField
				htmlFor='name'
				label='Tên đợt nghiên cứu'
				required
				error={errors.name}
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
					htmlFor='start_date'
					label='Ngày bắt đầu'
					required
					error={errors.start_date}
				>
					<DatePicker
						id='start_date'
						value={toInputDate(form.start_date)}
						onChange={(val) => set('start_date', fromInputDate(val))}
						hasError={!!errors.start_date}
						placeholder='Chọn ngày bắt đầu...'
					/>
				</FormField>
				<FormField
					htmlFor='end_date'
					label='Ngày kết thúc'
					required
					error={errors.end_date}
				>
					<DatePicker
						id='end_date'
						value={toInputDate(form.end_date)}
						onChange={(val) => set('end_date', fromInputDate(val))}
						hasError={!!errors.end_date}
						placeholder='Chọn ngày kết thúc...'
					/>
				</FormField>
			</div>
			{showDeadlines && (
				<>
					<div className={styles.formSection}>Mốc thời gian &amp; hạn nộp</div>
					{errors.deadlines && (
						<div className={dmStyles.errorMessage}>{errors.deadlines}</div>
					)}
					{form.start_date && form.end_date ? (
						<DeadlineManager
							drafts={form.deadlines}
							onDraftsChange={(next) => set('deadlines', next)}
							roundStart={toInputDate(form.start_date)}
							roundEnd={toInputDate(form.end_date)}
						/>
					) : (
						<div className={dmStyles.emptyTimelineNotice}>
							Chọn ngày bắt đầu và ngày kết thúc của đợt để thêm mốc thời gian.
						</div>
					)}
				</>
			)}
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
							<Badge
								tone={cfg.tone}
								dot
							>
								{label}
							</Badge>
							<span className={styles.statusOptionDesc}>{desc}</span>
						</button>
					);
				})}
			</div>
		</>
	);
}
