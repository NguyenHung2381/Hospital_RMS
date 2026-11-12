import { Badge } from '@/shared/components';
import type { TraineeDocState } from '../api/traineeRecordApi';
import { DOC_STATE_META, DOC_STATE_ORDER } from '../utils/docState';
import styles from './TraineeDocState.module.css';

export function TraineeDocStateBadge({
	state,
	onClick,
}: {
	state: TraineeDocState | undefined;
	onClick?: () => void;
}) {
	const meta = DOC_STATE_META[state ?? 'missing'];
	const badge = (
		<Badge
			tone={meta.tone}
			dot
			title={meta.hint}
		>
			{meta.label}
		</Badge>
	);
	if (!onClick) return badge;
	return (
		<button
			type='button'
			className={styles.badgeBtn}
			title={`${meta.hint} — bấm để xem`}
			onClick={onClick}
		>
			{badge}
		</button>
	);
}

/** Chú thích màu nhỏ đặt cạnh bộ lọc. */
export function TraineeDocStateLegend() {
	return (
		<span className={styles.legend}>
			{DOC_STATE_ORDER.map((s) => (
				<span
					key={s}
					className={styles.legendItem}
				>
					<span className={`${styles.swatch} ${styles[`swatch_${s}`]}`} />
					{DOC_STATE_META[s].label}
				</span>
			))}
		</span>
	);
}
