import { useNavigate } from 'react-router-dom';
import { Badge } from '@/shared/components';
import type { BadgeTone } from '@/shared/components/Badge/badgeTone';
import type { CouncilProgressStat } from '../../reports/types/report.type';
import styles from '../pages/Dashboard.module.css';

const RATING_CONFIG: Record<string, { label: string; tone: BadgeTone }> = {
	on_track: { label: 'Đúng tiến độ', tone: 'green' },
	behind: { label: 'Chậm tiến độ', tone: 'amber' },
	at_risk: { label: 'Cần đôn đốc', tone: 'red' },
};

interface CouncilProgressStripProps {
	data?: CouncilProgressStat;
	loading: boolean;
	error: boolean;
}

export function CouncilProgressStrip({
	data,
	loading,
	error,
}: CouncilProgressStripProps) {
	const navigate = useNavigate();
	const expected = data?.expected ?? 0;
	const completed = data?.completed ?? 0;
	const pct = expected > 0 ? Math.round((completed / expected) * 100) : 0;

	if (loading) {
		return (
			<div className={styles.councilStrip}>
				<div
					className={styles.skeleton}
					style={{ height: 48, width: '100%', borderRadius: 8 }}
				/>
			</div>
		);
	}

	if (error || !data || expected === 0) {
		return (
			<div className={styles.councilStrip}>
				<div className={styles.councilStripLeft}>
					<span className={styles.cardTitle}>Tiến độ Đánh giá của Hội đồng Khoa học</span>
				</div>
				<div style={{ color: 'var(--color-gray-400)', fontSize: 13 }}>
					{error ? 'Không tải được dữ liệu' : 'Chưa có dữ liệu đánh giá tiến độ'}
				</div>
			</div>
		);
	}

	return (
		<div className={styles.councilStrip}>
			<div className={styles.councilStripLeft}>
				<span
					className={styles.cardTitle}
					style={{ cursor: 'pointer' }}
					onClick={() => navigate('/admin/councils')}
				>
					Tiến độ Đánh giá của Hội đồng Khoa học
				</span>
				<div style={{ fontSize: 12, color: 'var(--color-gray-400)', marginTop: 2 }}>
					Tỷ lệ hoàn thành đánh giá tiến độ các đề tài nghiên cứu theo kế hoạch
				</div>
			</div>
			<div className={styles.councilStripProgress}>
				<div className={styles.councilStripNums}>
					<span className={styles.councilCompleted}>{completed}</span>
					<span className={styles.councilExpected}>
						/ {expected} lượt hoàn tất ({pct}%)
					</span>
				</div>
				<div className={styles.councilTrack}>
					<div
						className={styles.councilFill}
						style={{ width: `${pct}%` }}
					/>
				</div>
			</div>
			<div className={styles.councilStripRatings}>
				{data.by_rating.map((r) => {
					const cfg = RATING_CONFIG[r.rating] ?? {
						label: r.rating,
						tone: 'gray' as const,
					};
					return (
						<div
							key={r.rating}
							className={styles.councilRatingItem}
						>
							<Badge tone={cfg.tone}>{cfg.label}</Badge>
							<span className={styles.councilRatingCount}>{r.count}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
