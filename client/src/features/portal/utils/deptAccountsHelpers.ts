import type { BadgeTone } from '@/shared/components/Badge/badgeTone';

// Hiển thị tài khoản trong khoa theo vai trò (role_id).
export const ROLE_CFG: Record<
	string,
	{ label: string; tone: BadgeTone; avatarCls: string }
> = {
	VT01: { label: 'Quản trị', tone: 'purple', avatarCls: 'avatarPurple' },
	VT02: { label: 'Giám đốc / Lãnh đạo', tone: 'red', avatarCls: 'avatarRed' },
	VT03: { label: 'Cán bộ NCKH', tone: 'blue', avatarCls: 'avatarBlue' },
	VT04: { label: 'Hội đồng xét duyệt', tone: 'gray', avatarCls: 'avatarGray' },
	VT05: { label: 'Chủ nhiệm đề tài', tone: 'amber', avatarCls: 'avatarAmber' },
	VT06: { label: 'Thành viên đề tài', tone: 'green', avatarCls: 'avatarGreen' },
	VT07: { label: 'Trưởng khoa/phòng', tone: 'teal', avatarCls: 'avatarTeal' },
};

const FALLBACK_CFG = {
	label: 'Vai trò',
	tone: 'gray' as const,
	avatarCls: 'avatarGray',
};

export function roleCfg(roleId?: string | null) {
	return (roleId && ROLE_CFG[roleId]) || FALLBACK_CFG;
}

// Các vai trò mà tài khoản khoa được phép gán khi tạo/sửa tài khoản trong khoa.
export const EDITABLE_ROLES: { value: string; label: string }[] = [
	{ value: 'VT05', label: ROLE_CFG.VT05.label },
	{ value: 'VT06', label: ROLE_CFG.VT06.label },
	{ value: 'VT07', label: ROLE_CFG.VT07.label },
];

export interface EditForm {
	full_name: string;
	staff_number: string;
	email: string;
	role_id: string;
	is_active: boolean;
	password: string;
}
