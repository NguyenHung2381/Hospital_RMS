import styles from '../pages/TopicDetail.module.css';

type Props = { label: string; value: React.ReactNode; color?: string };

export default function InfoField({ label, value, color }: Props) {
	return (
		<div
			className={styles.infoItem}
			style={color ? { borderLeftColor: color } : undefined}
		>
			<div
				className={styles.infoLabel}
				style={color ? { color } : undefined}
			>
				{label}
			</div>
			<div className={styles.infoValue}>{value}</div>
		</div>
	);
}
