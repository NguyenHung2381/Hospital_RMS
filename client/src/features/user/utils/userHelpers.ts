import { removeDiacritics as stripDiacritics } from '../../../shared/utils/helper';
import type { BadgeTone } from '@/shared/components/Badge/badgeTone';

// Cấu hình hiển thị theo vai trò (role_id). Nhãn lấy động từ API khi có role_name;
// đây là fallback + tông màu badge/avatar cho các vai trò gốc.
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

const FALLBACK_ROLE_CFG = {
	label: 'Vai trò',
	tone: 'gray' as const,
	avatarCls: 'avatarGray',
};

export function roleCfg(roleId?: string | null) {
	return (roleId && ROLE_CFG[roleId]) || FALLBACK_ROLE_CFG;
}


export function isPasswordOld(dateStr: string | null): boolean {
	if (!dateStr) return true;
	const d = new Date(dateStr);
	if (isNaN(d.getTime())) return true;
	return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24) > 90;
}

function removeDiacritics(str: string): string {
	return stripDiacritics(str).toLowerCase();
}

export function suggestUsername(fullName: string, staffNumber: string): string {
	const words = fullName.trim().split(/\s+/).filter(Boolean);
	if (!words.length) return '';
	const last = removeDiacritics(words[words.length - 1]);
	const initials = words
		.slice(0, -1)
		.map((w) => removeDiacritics(w)[0] ?? '')
		.join('');
	const base = (last + initials).replace(/[^a-z0-9]/g, '');
	const code = staffNumber.replace(/[^a-z0-9]/gi, '').toLowerCase();
	return code ? `${base}_${code}` : base;
}
