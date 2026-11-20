import type { CmeCycleStatus } from '../api/cmeRequirementApi';
import { formatHours } from '../utils/cmeCycle';
import styles from './CmeCycleProgress.module.css';

/** Thanh tiến độ giờ tín chỉ trong chu kỳ — luôn kèm nhãn "đã có / yêu cầu" bằng chữ số. */
export function CmeCycleProgress({
	earned,
	required,
	status,
	large,
}: {
	earned: number;
	required: number;
	status: CmeCycleStatus;
	large?: boolean;
}) {
	const pct = required > 0 ? Math.min(100, Math.max(0, (earned / required) * 100)) : 0;
	return (
		<div className={`${styles.wrap} ${large ? styles.large : ''}`}>
			<span className={styles.label}>
				<strong>{formatHours(earned)}</strong> / {formatHours(required)} giờ
			</span>
			<div
				className={styles.track}
				role='progressbar'
				aria-label='Giờ tín chỉ trong chu kỳ'
				aria-valuemin={0}
				aria-valuemax={required}
				aria-valuenow={Math.min(earned, required)}
				aria-valuetext={`${formatHours(earned)} trên ${formatHours(required)} giờ`}
			>
				<div
					className={`${styles.fill} ${styles[status]}`}
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}
