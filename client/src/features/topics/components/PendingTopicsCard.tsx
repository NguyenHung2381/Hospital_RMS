import { AlertSvg, SendSvg, XSvg } from '@/assets/icons';
import type { SimpleItem } from '../api/topicApi';
import type { PendingTopic } from '../types/topicregister.type';
import { ARTICLE_TYPE_CFG } from '../utils/topicRegisterHelpers';
import styles from '../pages/TopicRegister.module.css';

interface PendingTopicsCardProps {
	pendingTopics: PendingTopic[];
	rounds: SimpleItem[];
	removeTopicFromList: (localId: string) => void;
	submitError: string;
	submittingAll: boolean;
	submitAll: () => void;
}

export function PendingTopicsCard({
	pendingTopics,
	rounds,
	removeTopicFromList,
	submitError,
	submittingAll,
	submitAll,
}: PendingTopicsCardProps) {
	return (
		<div className={styles.pendingCard}>
			<div className={styles.pendingHeader}>
				<span>Danh sách chờ gửi</span>
				<span className={styles.pendingBadge}>{pendingTopics.length}</span>
			</div>
			<div className={styles.pendingList}>
				{pendingTopics.map((t, i) => {
					const roundName =
						rounds.find((r) => r.id === t.round_id)?.name ?? '—';
					return (
						<div
							key={t.localId}
							className={styles.pendingItem}
						>
							<div className={styles.pendingNum}>{i + 1}</div>
							<div className={styles.pendingInfo}>
								<div className={styles.pendingTitle}>
									<span
										className={`${styles.badge} ${t.article_type === 'bai_bao' ? styles.badgeTeal : styles.badgeBlue}`}
										style={{ marginRight: 6 }}
									>
										{ARTICLE_TYPE_CFG[t.article_type].tabLabel}
									</span>
									{t.title}
								</div>
								<div className={styles.pendingMeta}>
									{roundName} · {t.members.length} thành viên
									{t.attachments.length > 0 && ` · ${t.attachments.length} file`}
								</div>
							</div>
							<button
								type='button'
								className={styles.removeBtn}
								onClick={() => removeTopicFromList(t.localId)}
								title='Xoá'
							>
								<XSvg />
							</button>
						</div>
					);
				})}
			</div>
			<div className={styles.pendingFooter}>
				{submitError && (
					<div className={styles.saveError}>
						<AlertSvg /> {submitError}
					</div>
				)}
				<button
					type='button'
					className={styles.btnPrimary}
					onClick={submitAll}
					disabled={submittingAll}
				>
					{submittingAll ? <span className={styles.spinner} /> : null}
					<SendSvg />
					Gửi tất cả ({pendingTopics.length})
				</button>
			</div>
		</div>
	);
}
