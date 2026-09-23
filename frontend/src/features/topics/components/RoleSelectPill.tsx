import type { MemberRole } from '../types/topic.type';
import { MEMBER_ROLE_CFG } from '../utils/topicHelpers';

interface RoleSelectPillProps {
	value: MemberRole;
	onChange: (role: MemberRole) => void;
	allowedRoles?: MemberRole[];
	disabledCheck?: (role: MemberRole) => boolean;
	disabled?: boolean;
	roleLabels?: Partial<Record<MemberRole, { label: string }>>;
	size?: 'sm' | 'md';
}

const ROLE_PILL_STYLES: Record<
	MemberRole,
	{ bg: string; color: string; border: string; hoverBg: string }
> = {
	leader: {
		bg: '#ecfdf5',
		color: '#047857',
		border: '#a7f3d0',
		hoverBg: '#d1fae5',
	},
	secretary: {
		bg: '#eff6ff',
		color: '#1d4ed8',
		border: '#bfdbfe',
		hoverBg: '#dbeafe',
	},
	member: {
		bg: '#f1f5f9',
		color: '#475569',
		border: '#cbd5e1',
		hoverBg: '#e2e8f0',
	},
};

export function RoleSelectPill({
	value,
	onChange,
	allowedRoles = ['leader', 'secretary', 'member'],
	disabledCheck,
	disabled = false,
	roleLabels,
	size = 'sm',
}: RoleSelectPillProps) {
	const currentStyle = ROLE_PILL_STYLES[value] || ROLE_PILL_STYLES.member;
	const isMd = size === 'md';

	return (
		<div
			style={{
				position: 'relative',
				display: 'inline-flex',
				alignItems: 'center',
				flexShrink: 0,
				height: isMd ? 38 : undefined,
			}}
		>
			<select
				value={value}
				disabled={disabled}
				onChange={(e) => onChange(e.target.value as MemberRole)}
				style={{
					appearance: 'none',
					WebkitAppearance: 'none',
					MozAppearance: 'none',
					padding: isMd ? '0 32px 0 14px' : '4px 26px 4px 12px',
					height: isMd ? '38px' : 'auto',
					borderRadius: 9999,
					fontSize: isMd ? 13 : 12,
					fontWeight: 600,
					cursor: disabled ? 'not-allowed' : 'pointer',
					outline: 'none',
					border: `1px solid ${currentStyle.border}`,
					background: currentStyle.bg,
					color: currentStyle.color,
					lineHeight: isMd ? '36px' : 1.3,
					transition: 'all 0.15s ease',
					boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
					display: 'inline-flex',
					alignItems: 'center',
				}}
				onMouseEnter={(e) => {
					if (!disabled) e.currentTarget.style.background = currentStyle.hoverBg;
				}}
				onMouseLeave={(e) => {
					if (!disabled) e.currentTarget.style.background = currentStyle.bg;
				}}
			>
				{allowedRoles.map((r) => {
					const label =
						roleLabels?.[r]?.label || MEMBER_ROLE_CFG[r]?.label || r;
					return (
						<option
							key={r}
							value={r}
							disabled={disabledCheck ? !disabledCheck(r) : false}
							style={{
								background: '#ffffff',
								color: '#1f2937',
								fontWeight: 500,
								padding: '6px 10px',
							}}
						>
							{label}
						</option>
					);
				})}
			</select>
			{/* Chevron icon */}
			<svg
				style={{
					position: 'absolute',
					right: isMd ? 10 : 8,
					pointerEvents: 'none',
					width: isMd ? 14 : 12,
					height: isMd ? 14 : 12,
					color: currentStyle.color,
					transition: 'color 0.15s ease',
				}}
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
