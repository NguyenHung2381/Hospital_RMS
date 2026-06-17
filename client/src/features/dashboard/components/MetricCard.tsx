import type React from 'react';
import { TrendDownSvg, TrendUpSvg } from '@/assets/icons';
import styles from '../pages/Dashboard.module.css';

export interface MetricCardProps {
	label: string;
	value: number | string;
	delta?: string;
	deltaType?: 'up' | 'down' | 'neutral';
	compare?: string;
	icon: React.ReactNode;
	iconClass: string;
	accent: 'accentGreen' | 'accentBlue' | 'accentAmber' | 'accentPink';
	loading?: boolean;
}

export function MetricCard({
	label,
	value,
	delta,
	deltaType = 'up',
	compare,
	icon,
	iconClass,
	accent,
	loading,
}: MetricCardProps) {
	const deltaClass =
		deltaType === 'up'
			? styles.deltaUp
			: deltaType === 'down'
				? styles.deltaDown
				: styles.deltaNeutral;
	return (
		<div className={`${styles.metricCard} ${styles[accent]}`}>
			<div className={styles.metricHeader}>
				<span className={styles.metricLabel}>{label}</span>
				<div
					className={`${styles.metricIconWrap} ${styles[iconClass as keyof typeof styles]}`}
				>
					{icon}
				</div>
			</div>
			{loading ? (
				<div
					className={styles.skeleton}
					style={{ height: 36, width: 80, borderRadius: 8 }}
				/>
			) : (
				<div className={styles.metricValue}>{value}</div>
			)}
			<div className={styles.metricFooter}>
				{delta && (
					<span className={`${styles.metricDelta} ${deltaClass}`}>
						{deltaType === 'up' ? (
							<TrendUpSvg
								width={12}
								height={12}
							/>
						) : deltaType === 'down' ? (
							<TrendDownSvg
								width={12}
								height={12}
							/>
						) : null}
						{delta}
					</span>
				)}
				{compare && <span className={styles.metricCompare}>{compare}</span>}
			</div>
		</div>
	);
}
