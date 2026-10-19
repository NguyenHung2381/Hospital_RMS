import { DatePicker } from '@/shared/components';
import { addDays, endOf, parseDuration, type DurationUnit } from '../utils/rotationDates';
import styles from '../pages/Courses.module.css';

// Ô chọn khoảng ngày của 1 vòng: Từ / Đến + nút chọn nhanh (theo mẫu yêu cầu).
// "Nối tiếp vòng trước" đặt ngày bắt đầu = ngày kế tiếp ngày kết thúc vòng trước;
// các nút còn lại đặt ngày kết thúc tính từ ngày bắt đầu.
export function RotationDateRange({
	start,
	end,
	duration,
	prevEnd,
	disabled,
	onChange,
}: {
	start: string;
	end: string;
	/** Thời lượng của vòng ("03 tháng") — cho nút "Theo thời lượng vòng". */
	duration: string | null;
	/** Ngày kết thúc của vòng ngay trước (nếu có). */
	prevEnd: string | null;
	disabled?: boolean;
	onChange: (start: string, end: string) => void;
}) {
	const d = parseDuration(duration);
	const quick: { label: string; title?: string; apply: () => void; show: boolean }[] = [
		{
			label: 'Nối tiếp vòng trước',
			title: prevEnd ? `Bắt đầu ${addDays(prevEnd, 1).split('-').reverse().join('/')}` : undefined,
			show: !!prevEnd,
			apply: () => {
				const s = addDays(prevEnd as string, 1);
				onChange(s, d ? endOf(s, d.value, d.unit) : end && end >= s ? end : '');
			},
		},
		{
			label: `Theo thời lượng${d ? ` (${duration})` : ''}`,
			show: !!d,
			apply: () => d && start && onChange(start, endOf(start, d.value, d.unit)),
		},
		...([
			[1, 'week', '+1 tuần'],
			[1.5, 'week', '+1,5 tuần'],
			[1, 'month', '+1 tháng'],
		] as [number, DurationUnit, string][]).map(([v, u, label]) => ({
			label,
			show: true,
			apply: () => start && onChange(start, endOf(start, v, u)),
		})),
	];

	return (
		<div>
			<div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
				<DatePicker
					value={start}
					onChange={(v) => onChange(v, end && v && end < v ? '' : end)}
					disabled={disabled}
					placeholder='Từ ngày'
					max={end || undefined}
					style={{ minWidth: 150, flex: '1 1 150px' }}
				/>
				<span className={styles.hint}>→</span>
				<DatePicker
					value={end}
					onChange={(v) => onChange(start, v)}
					disabled={disabled}
					placeholder='Đến ngày'
					min={start || undefined}
					rangeStart={start || undefined}
					style={{ minWidth: 150, flex: '1 1 150px' }}
				/>
			</div>
			<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
				<span className={styles.hint}>Chọn nhanh</span>
				{quick
					.filter((q) => q.show)
					.map((q) => (
						<button
							key={q.label}
							type='button'
							className={styles.btnSmall}
							title={q.title}
							disabled={disabled || (!start && q.label !== 'Nối tiếp vòng trước')}
							onClick={q.apply}
						>
							{q.label}
						</button>
					))}
			</div>
		</div>
	);
}
