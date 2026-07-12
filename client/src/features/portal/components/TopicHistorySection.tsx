import type { Approval as ApprovalHistory } from '../../approval/api/approval';
import { formatDate } from '../../../shared/utils/formatDate';
import { APV_STATUS_CFG } from '../utils/myTopicsHelpers';
import { Badge } from './MyTopicsBadge';
import styles from '../pages/MyTopics.module.css';

interface TopicHistorySectionProps {
	detailHistory: ApprovalHistory[];
}

export function TopicHistorySection({ detailHistory }: TopicHistorySectionProps) {
	if (detailHistory.length === 0) return null;

	return (
		<div>
			<div className={styles.sectionLabel}>
				Lịch sử xử lý ({detailHistory.length} lần)
			</div>
			<div className={styles.historyList}>
				{[...detailHistory].reverse().map((h, i) => {
					const hcfg = APV_STATUS_CFG[h.status] ?? {
						label: h.status,
						badgeCls: 'badgeGray',
					};
					return (
						<div
							key={i}
							className={styles.historyItem}
						>
							<div className={styles.historyTop}>
								<span className={styles.historyReviewer}>
									{h.approver_name ?? h.created_by} — {hcfg.label}
								</span>
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 8,
									}}
								>
									<Badge
										cls={hcfg.badgeCls}
										dot
									>
										{hcfg.label}
									</Badge>
									<span className={styles.historyDate}>
										{formatDate(h.created_at)}
									</span>
								</div>
							</div>
							{h.comment && (
								<div className={styles.historyComment}>
									"{h.comment}"
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
