import styles from '../pages/TopicDetail.module.css';

type Props = { label: string; value: React.ReactNode };

export default function InfoField({ label, value }: Props) {
	return (
		<div className={styles.infoItem}>
			<div className={styles.infoLabel}>{label}</div>
			<div className={styles.infoValue}>{value}</div>
		</div>
	);
}
