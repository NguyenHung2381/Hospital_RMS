import { XSvg } from '@/assets/icons';
import type { PendingMember } from '../hooks/useTopicModal';
import type { MemberRole } from '../types/topic.type';
import { getInitials } from '../../../shared/utils/helper';
import { isEditRoleAllowed, MEMBER_ROLE_CFG } from '../utils/topicHelpers';
import styles from '../pages/Topic.module.css';

interface PendingMemberListProps {
	pendingMembers: PendingMember[];
	removeMember: (tempId: string) => void;
	changeRole: (tempId: string, role: MemberRole) => void;
}

export function PendingMemberList({
	pendingMembers,
	removeMember,
	changeRole,
}: PendingMemberListProps) {
	if (pendingMembers.length === 0) return null;

	return (
		<div
			style={{
				border: '1px solid var(--color-gray-200)',
				borderRadius: 8,
				maxHeight: '180px',
				overflowY: 'auto',
			}}
		>
			{pendingMembers.map((m) => (
				<div
					key={m.tempId}
					className={styles.memberItem}
					style={{ padding: '8px 12px' }}
				>
					<div
						className={styles.memberAvatar}
						style={{ width: 32, height: 32, fontSize: 11 }}
					>
						{getInitials(m.ho_ten)}
					</div>
					<div className={styles.memberInfo}>
						<div className={styles.memberName}>{m.ho_ten}</div>
						<div className={styles.memberMeta}>
							MNV: {m.staff_number || 'N/A'}
							{m.email && ` · ${m.email}`}
							{m.so_dien_thoai && ` · ${m.so_dien_thoai}`}
							{m.username && ` · ${m.username}`}
							{m.department_name && ` · ${m.department_name}`}
						</div>
					</div>
					<select
						className={styles.formSelect}
						style={{
							width: 110,
							flexShrink: 0,
							fontSize: 12,
							padding: '3px 8px',
						}}
						value={m.role}
						onChange={(e) =>
							changeRole(m.tempId, e.target.value as MemberRole)
						}
					>
						{(Object.keys(MEMBER_ROLE_CFG) as MemberRole[]).map((r) => (
							<option
								key={r}
								value={r}
								disabled={!isEditRoleAllowed(pendingMembers, m.tempId, r)}
							>
								{MEMBER_ROLE_CFG[r].label}
							</option>
						))}
					</select>
					<button
						type='button'
						onClick={() => removeMember(m.tempId)}
						style={{
							background: 'none',
							border: 'none',
							cursor: 'pointer',
							color: 'var(--color-gray-400)',
							padding: 4,
							borderRadius: 4,
							display: 'flex',
							alignItems: 'center',
						}}
						title='Xoá khỏi danh sách'
					>
						<XSvg />
					</button>
				</div>
			))}
		</div>
	);
}
