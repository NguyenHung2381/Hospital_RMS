import { XSvg } from '@/assets/icons';
import type { PendingMember } from '../hooks/useTopicModal';
import { getInitials } from '../../../shared/utils/helper';
import { MEMBER_ROLE_CFG } from '../utils/topicHelpers';
import { Badge } from './Badge';
import styles from '../pages/Topic.module.css';

interface PendingMemberListProps {
	pendingMembers: PendingMember[];
	removeMember: (tempId: string) => void;
}

export function PendingMemberList({ pendingMembers, removeMember }: PendingMemberListProps) {
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
			{pendingMembers.map((m) => {
				const rc = MEMBER_ROLE_CFG[m.role];
				return (
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
						<Badge cls={rc.cls}>{rc.label}</Badge>
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
				);
			})}
		</div>
	);
}
