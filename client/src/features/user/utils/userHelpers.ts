import { removeDiacritics as stripDiacritics } from '../../../shared/utils/helper';

// Cấu hình hiển thị theo vai trò (role_id). Nhãn lấy động từ API khi có role_name;
// đây là fallback + màu badge/avatar cho các vai trò gốc.
export const ROLE_CFG: Record<
	string,
	{ label: string; cls: string; avatarCls: string }
> = {
	VT01: { label: 'Quản trị', cls: 'rolePurple', avatarCls: 'avatarPurple' },
	VT02: { label: 'Giám đốc / Lãnh đạo', cls: 'roleRed', avatarCls: 'avatarRed' },
	VT03: { label: 'Cán bộ NCKH', cls: 'roleBlue', avatarCls: 'avatarBlue' },
	VT04: { label: 'Hội đồng xét duyệt', cls: 'roleGray', avatarCls: 'avatarGray' },
	VT05: { label: 'Chủ nhiệm đề tài', cls: 'roleAmber', avatarCls: 'avatarAmber' },
	VT06: { label: 'Thành viên đề tài', cls: 'roleGreen', avatarCls: 'avatarGreen' },
	VT07: { label: 'Trưởng khoa/phòng', cls: 'roleTeal', avatarCls: 'avatarTeal' },
};

const FALLBACK_ROLE_CFG = {
	label: 'Vai trò',
	cls: 'roleGray',
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
