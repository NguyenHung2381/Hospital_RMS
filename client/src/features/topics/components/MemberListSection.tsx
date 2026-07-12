import { AlertSvg as IcAlert, InfoSvg as IcInfo, TrashSvg as IcTrash } from '@/assets/icons';
import type { Topic, TopicMember } from '../types/topic.type';
import { getInitials } from '../../../shared/utils/helper';
import { genMemberUsername, MEMBER_ROLE_CFG } from '../utils/topicHelpers';
import { Badge } from './Badge';
import styles from '../pages/Topic.module.css';

interface MemberListSectionProps {
	topic: Topic;
	members: TopicMember[];
	grantingIds: Set<string>;
	grantError: string;
	pendingMembers: TopicMember[];
	membersMissingEmail: TopicMember[];
	canGrantAccountsNoEmail: boolean;
	handleGrantAccountsNoEmail: () => void;
	handleGrantSingleMember: (memberId: string) => void;
	handleDeleteMember: (memberId: string) => void;
}

export function MemberListSection({
	topic,
	members,
	grantingIds,
	grantError,
	pendingMembers,
	membersMissingEmail,
	canGrantAccountsNoEmail,
	handleGrantAccountsNoEmail,
	handleGrantSingleMember,
	handleDeleteMember,
}: MemberListSectionProps) {
	return (
		<>
			{pendingMembers.length > 0 && (
				<div className={styles.grantBar}>
					<div className={styles.grantBarText}>
						<IcInfo />
						{pendingMembers.length} thành viên chưa có tài khoản
					</div>
					<button
						className={styles.grantBarBtn}
						onClick={() => handleGrantAccountsNoEmail()}
						disabled={grantingIds.size > 0 || !canGrantAccountsNoEmail}
					>
						{grantingIds.size > 0 ? 'Đang cấp...' : 'Cấp tài khoản cho tất cả'}
					</button>
				</div>
			)}

			{grantError && (
				<div
					style={{
						fontSize: 12,
						color: 'var(--color-red-600)',
						display: 'flex',
						gap: 4,
						alignItems: 'center',
					}}
				>
					<IcAlert /> {grantError}
				</div>
			)}

			{pendingMembers.length > 0 && topic.status !== 'approved' && (
				<div
					style={{
						fontSize: 12,
						color: 'var(--color-amber-700)',
						display: 'flex',
						gap: 4,
						alignItems: 'center',
					}}
				>
					<IcInfo /> Cần duyệt đề tài trước khi cấp tài khoản thành viên.
				</div>
			)}

			{membersMissingEmail.length > 0 && (
				<div
					style={{
						fontSize: 12,
						color: 'var(--color-amber-700)',
						display: 'flex',
						gap: 4,
						alignItems: 'center',
					}}
				>
					<IcInfo /> {membersMissingEmail.length} thành viên chưa có email nên
					chưa thể tạo tài khoản.
				</div>
			)}

			{members.length === 0 ? (
				<p
					style={{
						fontSize: 13,
						color: 'var(--color-gray-400)',
						textAlign: 'center',
						padding: '32px 0',
					}}
				>
					Chưa có thành viên nào
				</p>
			) : (
				<div className={styles.memberList}>
					{members.map((m) => {
						const rc = MEMBER_ROLE_CFG[m.role];
						const isGranting = grantingIds.has(m.id);
						const expiryDate = m.account_expires_at
							? new Date(m.account_expires_at).toLocaleDateString('vi-VN', {
									day: '2-digit',
									month: '2-digit',
									year: 'numeric',
								})
							: null;
						return (
							<div
								key={m.id}
								className={styles.memberItem}
							>
								<div className={styles.memberAvatar}>
									{getInitials(m.ho_ten)}
								</div>
								<div className={styles.memberInfo}>
									<div className={styles.memberName}>{m.ho_ten}</div>
									<div className={styles.memberMeta}>
										{m.staff_number && <span>MNV: {m.staff_number} · </span>}
										{m.email} · {m.chuc_vu ?? 'N/A'}
									</div>
								</div>
								<div className={styles.memberRight}>
									<Badge cls={rc.cls}>{rc.label}</Badge>
									{m.account_granted ? (
										<div className={styles.memberAccountInfo}>
											<span className={styles.memberAccountGranted}>
												✓ {m.username}
											</span>
											{expiryDate && (
												<span className={styles.memberAccountExpiry}>
													HH đến {expiryDate}
												</span>
											)}
										</div>
									) : m.has_existing_account ? (
										<div className={styles.memberAccountInfo}>
											<span
												style={{
													fontSize: 11,
													color: 'var(--color-amber-600, #d97706)',
													fontWeight: 600,
												}}
											>
												Đã có TK
											</span>
											{m.staff_number && (
												<span
													style={{
														fontSize: 11,
														color: 'var(--color-gray-400)',
													}}
												>
													TK: {genMemberUsername(m.ho_ten, m.staff_number)}
												</span>
											)}
										</div>
									) : (
										<div
											style={{
												display: 'flex',
												flexDirection: 'column',
												alignItems: 'flex-end',
												gap: 2,
											}}
										>
											{m.staff_number && (
												<span
													style={{
														fontSize: 11,
														color: 'var(--color-gray-400)',
													}}
												>
													TK: {genMemberUsername(m.ho_ten, m.staff_number)}
												</span>
											)}
											<button
												className={styles.grantBtn}
												onClick={() => handleGrantSingleMember(m.id)}
												disabled={
													isGranting ||
													grantingIds.size > 0 ||
													!canGrantAccountsNoEmail
												}
											>
												{isGranting ? '...' : 'Cấp TK'}
											</button>
										</div>
									)}
								</div>
								<div
									className={`${styles.actionBtn} ${styles.danger}`}
									title='Xoá thành viên'
									onClick={() => handleDeleteMember(m.id)}
									style={{ marginLeft: 4, flexShrink: 0 }}
								>
									<IcTrash />
								</div>
							</div>
						);
					})}
				</div>
			)}
		</>
	);
}
