import { CheckCircleSvg, ClockSvg, EditSvg, MessageSvg, XCircleSvg } from '@/assets/icons';
import type { Approval as ApprovalHistory, TopicApprovalDetail } from '../../approval/api/approval';
import { formatDate } from '../../../shared/utils/formatDate';
import styles from '../pages/MyTopics.module.css';

interface TopicStatusActionPanelProps {
	detailTopic: TopicApprovalDetail;
	latestApproval: ApprovalHistory | null;
	canEditTopic: boolean;
	openEdit: () => void;
}

export function TopicStatusActionPanel({
	detailTopic,
	latestApproval,
	canEditTopic,
	openEdit,
}: TopicStatusActionPanelProps) {
	const approver = latestApproval?.approver_name ?? latestApproval?.created_by;
	const decidedAt = formatDate(latestApproval?.created_at ?? detailTopic.updated_at);
	// "Phê duyệt bởi A · 28/09/2026" — không có người duyệt thì chỉ hiện ngày
	const decidedLine = (prefix: string) =>
		approver ? `${prefix} ${approver} · ${decidedAt}` : `Ngày ${decidedAt}`;

	return (
		<div className={styles.actionPanel}>
			{detailTopic.status === 'submitted' && (
				<div className={`${styles.processedNotice} ${styles.processedAmber}`}>
					<ClockSvg />
					<div>
						<div className={styles.noticeTitle}>Đề tài đang chờ phê duyệt</div>
						<div className={styles.noticeSub}>
							Hồ sơ đã được nộp và đang chờ Ban Quản lý khoa học xem xét.
						</div>
					</div>
				</div>
			)}
			{detailTopic.status === 'approved' && (
				<div className={`${styles.processedNotice} ${styles.processedApproved}`}>
					<CheckCircleSvg />
					<div>
						<div className={styles.noticeTitle}>Đề tài đã được phê duyệt</div>
						<div className={styles.noticeSub}>{decidedLine('Phê duyệt bởi')}</div>
					</div>
				</div>
			)}
			{detailTopic.status === 'rejected' && (
				<div className={`${styles.processedNotice} ${styles.processedRejected}`}>
					<XCircleSvg />
					<div>
						<div className={styles.noticeTitle}>Đề tài không được phê duyệt</div>
						<div className={styles.noticeSub}>{decidedLine('Bởi')}</div>
					</div>
				</div>
			)}
			{detailTopic.status === 'supplement' && (
				<div className={`${styles.processedNotice} ${styles.processedBlue}`}>
					<MessageSvg />
					<div>
						<div className={styles.noticeTitle}>Cần bổ sung hồ sơ</div>
						<div className={styles.noticeSub}>
							Hội đồng yêu cầu bổ sung thêm thông tin. Vui lòng cập nhật thông
							tin và tài liệu.
						</div>
					</div>
				</div>
			)}
			{canEditTopic && (
				<button
					className={styles.btnEdit}
					onClick={openEdit}
				>
					<EditSvg />
					Chỉnh sửa đề tài
				</button>
			)}
		</div>
	);
}
