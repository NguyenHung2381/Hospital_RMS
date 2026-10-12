import type { ReactNode } from 'react';
import { XSvg } from '@/assets/icons';
import type { PendingMember } from '../hooks/useTopicModal';
import type { MemberRole } from '../types/topic.type';
import { getInitials } from '../../../shared/utils/helper';
import { isEditRoleAllowed } from '../utils/topicHelpers';
import { RoleSelectPill } from './RoleSelectPill';
import styles from './PendingMemberList.module.css';

/** Một dòng thành viên chờ thêm vào đề tài: avatar + tên + thông tin phụ + chọn vai trò + nút gỡ. */
export function PendingMemberRow({
	name,
	details,
	rolePill,
	onRemove,
	removeTitle = 'Xóa khỏi danh sách',
}: {
	name: string;
	/** Các mẩu thông tin phụ, phần tử rỗng sẽ bị bỏ qua. */
	details: (string | undefined | null | false)[];
	rolePill: ReactNode;
	onRemove: () => void;
	removeTitle?: string;
}) {
	return (
		<div className={styles.row}>
			<div className={styles.main}>
				<div className={styles.avatar}>{getInitials(name)}</div>
				<div className={styles.info}>
					<div className={styles.name}>{name}</div>
					<div className={styles.meta}>{details.filter(Boolean).join(' · ')}</div>
				</div>
			</div>
			<div className={styles.actions}>
				{rolePill}
				<button
					type='button'
					className={styles.remove}
					onClick={onRemove}
					title={removeTitle}
				>
					<XSvg />
				</button>
			</div>
		</div>
	);
}

export function PendingMemberList({
	pendingMembers,
	removeMember,
	changeRole,
}: {
	pendingMembers: PendingMember[];
	removeMember: (tempId: string) => void;
	changeRole: (tempId: string, role: MemberRole) => void;
}) {
	if (pendingMembers.length === 0) return null;

	return (
		<div className={styles.list}>
			{pendingMembers.map((m) => (
				<PendingMemberRow
					key={m.tempId}
					name={m.ho_ten}
					details={[m.staff_number && `MNV: ${m.staff_number}`, m.department_name || m.email]}
					onRemove={() => removeMember(m.tempId)}
					rolePill={
						<RoleSelectPill
							value={m.role}
							onChange={(role) => changeRole(m.tempId, role)}
							disabledCheck={(r) => isEditRoleAllowed(pendingMembers, m.tempId, r)}
						/>
					}
				/>
			))}
		</div>
	);
}
