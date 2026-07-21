import { useEffect, useState } from 'react';
import logo from '../../../assets/logo-spinner.png';
import styles from './Loading.module.css';

export default function PageLoading() {
	const [percent, setPercent] = useState(0);

	useEffect(() => {
		const id = setInterval(() => {
			// ponytail: fake progress, no real load events to hook into — eases toward 92% and holds
			setPercent((p) => (p >= 92 ? p : p + (92 - p) / 8));
		}, 150);
		return () => clearInterval(id);
	}, []);

	return (
		<div className={styles.wrapper}>
			<div className={styles.glowOrb} />
			<div className={styles.glowOrb} />

			<div className={styles.spinnerWrapper}>
				<div className={styles.ringOuter} />
				<div className={styles.ringInner} />
				<img
					src={logo}
					alt='Loading'
					className={styles.logoCircle}
					fetchPriority='high'
				/>
			</div>

			<div className={styles.progressTrack}>
				<div
					className={styles.progressFill}
					style={{ width: `${percent}%` }}
				/>
			</div>
			<div className={styles.percentText}>{Math.round(percent)}%</div>
		</div>
	);
}

export * from './Skeleton';

