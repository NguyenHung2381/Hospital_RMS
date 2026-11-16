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
	/** accentAttention (hồng) chỉ cho chỉ số "đang chờ xử lý" — xem Dashboard.module.css */
	accent: 'accentGreen' | 'accentBlue' | 'accentAmber' | 'accentPurple' | 'accentAttention';
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
	// Hồng chỉ khi có việc chờ thật: chỉ số "chờ xử lý" bằng 0 hiển thị trung tính,
	// không báo động khi không có gì để làm.
	const calm = accent === 'accentAttention' && !loading && (value === 0 || value === '0');
	const cardAccent = calm ? 'accentBlue' : accent;
	const iconCls = calm && iconClass === 'iconAttention' ? 'iconGray' : iconClass;
	const deltaClass =
		deltaType === 'up'
			? styles.deltaUp
			: deltaType === 'down'
				? styles.deltaDown
				: styles.deltaNeutral;
	return (
		<div className={`${styles.metricCard} ${styles[cardAccent]}`}>
			<div className={styles.metricHeader}>
				<span className={styles.metricLabel}>{label}</span>
				<div
					className={`${styles.metricIconWrap} ${styles[iconCls as keyof typeof styles]}`}
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
