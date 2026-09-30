import type { Approval as ApprovalHistory, TopicApprovalDetail } from '../../approval/api/approval';
import type { TopicStatus } from '../../topics/types/topic.type';
import { formatDate } from '../../../shared/utils/formatDate';
import { getInitials } from '../../../shared/utils/helper';
import { Badge } from '@/shared/components';
import { STATUS_CFG } from '../utils/myTopicsHelpers';
import styles from '../pages/MyTopics.module.css';

interface TopicInfoSectionProps {
	detailTopic: TopicApprovalDetail;
	latestApproval: ApprovalHistory | null;
}

export function TopicHeader({ detailTopic }: { detailTopic: TopicApprovalDetail }) {
	return (
		<div className={styles.detailHeader}>
			<div className={styles.detailTopicId}>{detailTopic.id}</div>
			<div className={styles.detailTitle}>{detailTopic.title}</div>
			<div className={styles.detailBadges}>
				<Badge
					tone={
						STATUS_CFG[detailTopic.status as TopicStatus]?.tone ?? 'gray'
					}
					dot
				>
					{STATUS_CFG[detailTopic.status as TopicStatus]?.label ??
						detailTopic.status}
				</Badge>
				{detailTopic.category_id && (
					<Badge tone='gray'>
						{detailTopic.category_name ?? detailTopic.category_id}
					</Badge>
				)}
				{detailTopic.level_id && (
					<Badge tone='gray'>
						{detailTopic.level_name ?? detailTopic.level_id}
					</Badge>
				)}
			</div>
		</div>
	);
}

export function TopicInfoSection({ detailTopic, latestApproval }: TopicInfoSectionProps) {
	return (
		<>
			{/* Info grid */}
			<div className={styles.infoGrid}>
				<div className={styles.infoItem}>
					<div className={styles.infoLabel}>Người đăng ký</div>
					<div className={styles.infoValue}>
						{detailTopic.created_by_name ?? detailTopic.created_by}
					</div>
				</div>
				<div className={styles.infoItem}>
					<div className={styles.infoLabel}>Phòng ban / Khoa</div>
					<div className={styles.infoValue}>
						{detailTopic.department_name ??
							detailTopic.department_id ??
							'—'}
					</div>
				</div>
				<div className={styles.infoItem}>
					<div className={styles.infoLabel}>Đợt nghiên cứu</div>
					<div className={styles.infoValue}>
						{detailTopic.round_name ?? detailTopic.round_id ?? '—'}
					</div>
				</div>
				<div className={styles.infoItem}>
					<div className={styles.infoLabel}>Số thành viên</div>
					<div className={styles.infoValue}>
						{detailTopic.members?.length ??
							detailTopic.member_count ??
							0}{' '}
						người
					</div>
				</div>
				<div className={styles.infoItem}>
					<div className={styles.infoLabel}>Ngày nộp hồ sơ</div>
					<div className={styles.infoValue}>
						{formatDate(detailTopic.created_at)}
					</div>
				</div>
				{(latestApproval ?? detailTopic.updated_at) && (
					<div className={styles.infoItem}>
						<div className={styles.infoLabel}>Cập nhật lần cuối</div>
						<div className={styles.infoValue}>
							{formatDate(
								latestApproval?.created_at ?? detailTopic.updated_at,
							)}
							{(latestApproval?.approver_name ?? latestApproval?.created_by) &&
								` · ${latestApproval?.approver_name ?? latestApproval?.created_by}`}
						</div>
					</div>
				)}
			</div>

			{/* Members */}
			{(detailTopic.members?.length ?? 0) > 0 && (
				<div className={styles.descSection}>
					<div className={styles.sectionLabel}>
						Thành viên nhóm nghiên cứu ({detailTopic.members?.length ?? 0}{' '}
						người)
					</div>
					<div className={styles.membersGrid}>
						{(detailTopic.members ?? []).map((m, i) => {
							const isLead = m.role === 'leader';
							const isSec = m.role === 'secretary';

							const avatarCls = isLead
								? styles.memberRoleLead
								: isSec
									? styles.memberRoleSecretary
									: styles.memberRoleMember;

							const badgeCls = isLead
								? styles.roleBadgeLead
								: isSec
									? styles.roleBadgeSecretary
									: styles.roleBadgeMember;

							const roleLabel = isLead
								? 'Chủ nhiệm'
								: isSec
									? 'Thư ký'
									: 'Thành viên';

							const initials = getInitials(m.ho_ten || m.username || 'TV');

							return (
								<div
									key={m.id || i}
									className={styles.memberCard}
								>
									<div className={`${styles.memberAvatar} ${avatarCls}`}>
										{initials}
									</div>
									<div className={styles.memberInfo}>
										<div className={styles.memberName}>
											{m.ho_ten}
										</div>
										<div className={styles.memberMeta}>
											<span className={badgeCls}>
												{roleLabel}
											</span>
											{m.department_name && (
												<span className={styles.memberDept}>
													{m.department_name}
												</span>
											)}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* Description */}
			<div className={styles.descSection}>
				<div className={styles.sectionLabel}>
					Mô tả / Tóm tắt đề tài
				</div>
				<div className={styles.descBox}>
					{detailTopic.description || 'Chưa có mô tả.'}
				</div>
			</div>
		</>
	);
}
