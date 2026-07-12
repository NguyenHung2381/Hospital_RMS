import { CheckCircleSvg, ClockSvg, EditSvg, MessageSvg, XCircleSvg } from '@/assets/icons';
import type { Approval as ApprovalHistory, TopicApprovalDetail } from '../../approval/api/approval';
import { formatDate } from '../../../shared/utils/formatDate';
import styles from '../pages/MyTopics.module.css';

interface TopicStatusActionPanelProps {
	detailTopic: TopicApprovalDetail;
	latestApproval: ApprovalHistory | null;
	openEdit: () => void;
}

export function TopicStatusActionPanel({
	detailTopic,
	latestApproval,
	openEdit,
}: TopicStatusActionPanelProps) {
	return (
		<div className={styles.actionPanel}>
			{detailTopic.status === 'submitted' && (
				<div
					className={`${styles.processedNotice} ${styles.processedAmber}`}
				>
					<ClockSvg />
					<div>
						<div style={{ fontWeight: 700, fontSize: 13 }}>
							Đề tài đang chờ phê duyệt
						</div>
						<div style={{ fontSize: 12, marginTop: 2 }}>
							Hồ sơ đã được nộp và đang chờ hội đồng xem xét.
						</div>
					</div>
				</div>
			)}
			{detailTopic.status === 'approved' && (
				<div
					className={`${styles.processedNotice} ${styles.processedApproved}`}
				>
					<CheckCircleSvg />
					<div>
						<div style={{ fontWeight: 700, fontSize: 13 }}>
							Đề tài đã được phê duyệt
						</div>
						<div style={{ fontSize: 12, marginTop: 2 }}>
							Phê duyệt bởi{' '}
							{latestApproval?.approver_name ??
								latestApproval?.created_by ??
								'—'}{' '}
							·{' '}
							{formatDate(
								latestApproval?.created_at ?? detailTopic.updated_at,
							)}
						</div>
					</div>
				</div>
			)}
			{detailTopic.status === 'rejected' && (
				<div
					className={`${styles.processedNotice} ${styles.processedRejected}`}
				>
					<XCircleSvg />
					<div>
						<div style={{ fontWeight: 700, fontSize: 13 }}>
							Đề tài đã bị từ chối
						</div>
						<div style={{ fontSize: 12, marginTop: 2 }}>
							Bởi{' '}
							{latestApproval?.approver_name ??
								latestApproval?.created_by ??
								'—'}{' '}
							·{' '}
							{formatDate(
								latestApproval?.created_at ?? detailTopic.updated_at,
							)}
						</div>
					</div>
				</div>
			)}
			{detailTopic.status === 'supplement' && (
				<div className={styles.supplementActions}>
					<div
						className={`${styles.processedNotice} ${styles.processedBlue}`}
						style={{ flex: 1 }}
					>
						<MessageSvg />
						<div>
							<div style={{ fontWeight: 700, fontSize: 13 }}>
								Cần bổ sung hồ sơ
							</div>
							<div style={{ fontSize: 12, marginTop: 2 }}>
								Hội đồng yêu cầu bổ sung thêm thông tin. Vui lòng cập
								nhật thông tin và tài liệu.
							</div>
						</div>
					</div>
					<button
						className={styles.btnEdit}
						onClick={openEdit}
					>
						<EditSvg />
						Chỉnh sửa đề tài
					</button>
				</div>
			)}
		</div>
	);
}
