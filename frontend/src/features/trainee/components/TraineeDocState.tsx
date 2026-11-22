import { Badge } from '@/shared/components';
import type { TraineeDocState } from '../api/traineeRecordApi';
import { DOC_STATE_META } from '../utils/docState';
import styles from './TraineeDocState.module.css';

export function TraineeDocStateBadge({
	state,
	onClick,
	withSubject,
}: {
	state: TraineeDocState | undefined;
	onClick?: () => void;
	/** Ghi rõ "Hồ sơ PDF: …" — khi nhãn đứng cạnh các nhãn khác, không có tiêu đề cột */
	withSubject?: boolean;
}) {
	const meta = DOC_STATE_META[state ?? 'missing'];
	const badge = (
		<Badge
			tone={meta.tone}
			dot
			title={meta.hint}
		>
			{withSubject ? meta.tag : meta.label}
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
