import type { MemberRole } from '../types/topic.type';
import { MEMBER_ROLE_CFG } from '../utils/topicHelpers';
import styles from './RoleSelectPill.module.css';

interface RoleSelectPillProps {
	value: MemberRole;
	onChange: (role: MemberRole) => void;
	allowedRoles?: MemberRole[];
	disabledCheck?: (role: MemberRole) => boolean;
	disabled?: boolean;
	roleLabels?: Partial<Record<MemberRole, { label: string }>>;
	size?: 'sm' | 'md';
	/** Tên truy cập của ô chọn (mặc định "Vai trò trong đề tài"). */
	ariaLabel?: string;
}

export function RoleSelectPill({
	value,
	onChange,
	allowedRoles = ['leader', 'secretary', 'member'],
	disabledCheck,
	disabled = false,
	roleLabels,
	size = 'sm',
	ariaLabel = 'Vai trò trong đề tài',
}: RoleSelectPillProps) {
	const roleCls = styles[value] ?? styles.member;

	return (
		<div className={`${styles.wrap} ${roleCls} ${size === 'md' ? styles.md : ''}`}>
			<select
				className={styles.select}
				aria-label={ariaLabel}
				value={value}
				disabled={disabled}
				onChange={(e) => onChange(e.target.value as MemberRole)}
			>
				{allowedRoles.map((r) => {
					const label =
						roleLabels?.[r]?.label || MEMBER_ROLE_CFG[r]?.label || r;
					return (
						<option
							key={r}
							value={r}
							disabled={disabledCheck ? !disabledCheck(r) : false}
						>
							{label}
						</option>
					);
				})}
			</select>
			<svg
				className={styles.chevron}
				aria-hidden='true'
				fill='none'
				viewBox='0 0 24 24'
				stroke='currentColor'
				strokeWidth={2.5}
			>
				<path
					strokeLinecap='round'
					strokeLinejoin='round'
					d='M19 9l-7 7-7-7'
				/>
			</svg>
		</div>
	);
}
