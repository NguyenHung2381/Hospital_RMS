import { XSvg } from '@/assets/icons';
import type { PendingMember } from '../hooks/useTopicModal';
import type { MemberRole } from '../types/topic.type';
import { getInitials } from '../../../shared/utils/helper';
import { isEditRoleAllowed } from '../utils/topicHelpers';
import { RoleSelectPill } from './RoleSelectPill';

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
				display: 'flex',
				flexDirection: 'column',
				gap: 6,
				maxHeight: '220px',
				overflowY: 'auto',
				marginTop: 8,
				paddingRight: 2,
			}}
		>
			{pendingMembers.map((m) => (
				<div
					key={m.tempId}
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						gap: 12,
						padding: '8px 12px',
						background: '#ffffff',
						border: '1px solid var(--color-gray-200, #e5e7eb)',
						borderRadius: 10,
						transition: 'all 0.15s ease',
						boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
					}}
				>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 10,
							flex: 1,
							minWidth: 0,
						}}
					>
						<div
							style={{
								width: 34,
								height: 34,
								borderRadius: '50%',
								background: 'var(--color-primary-pale, #ecfdf5)',
								border: '1.5px solid rgba(10, 155, 74, 0.25)',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								fontSize: 11.5,
								fontWeight: 700,
								color: 'var(--color-primary-dark, #047857)',
								flexShrink: 0,
							}}
						>
							{getInitials(m.ho_ten)}
						</div>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div
								style={{
									fontSize: 13,
									fontWeight: 600,
									color: 'var(--color-gray-800, #1f2937)',
									whiteSpace: 'nowrap',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
								}}
							>
								{m.ho_ten}
							</div>
							<div
								style={{
									fontSize: 11,
									color: 'var(--color-gray-500, #6b7280)',
									display: 'flex',
									alignItems: 'center',
									gap: 4,
									flexWrap: 'wrap',
									marginTop: 1,
								}}
							>
								{m.staff_number && <span>MNV: {m.staff_number}</span>}
								{m.staff_number && (m.department_name || m.email) && <span>·</span>}
								{m.department_name && <span>{m.department_name}</span>}
								{!m.department_name && m.email && <span>{m.email}</span>}
							</div>
						</div>
					</div>

					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							flexShrink: 0,
						}}
					>
						<RoleSelectPill
							value={m.role}
							onChange={(role) => changeRole(m.tempId, role)}
							disabledCheck={(r) =>
								isEditRoleAllowed(pendingMembers, m.tempId, r)
							}
						/>
						<button
							type='button'
							onClick={() => removeMember(m.tempId)}
							style={{
								background: 'transparent',
								border: 'none',
								cursor: 'pointer',
								color: 'var(--color-gray-400, #9ca3af)',
								padding: 5,
								borderRadius: 6,
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								transition: 'all 0.15s ease',
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = '#fee2e2';
								e.currentTarget.style.color = '#dc2626';
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = 'transparent';
								e.currentTarget.style.color = 'var(--color-gray-400, #9ca3af)';
							}}
							title='Xóa khỏi danh sách'
						>
							<XSvg style={{ width: 14, height: 14 }} />
						</button>
					</div>
				</div>
			))}
		</div>
	);
}

