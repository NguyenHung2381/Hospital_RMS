import type { AccountType } from '../types/user.type';

export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
	{ value: 'admin', label: 'Quản trị' },
	{ value: 'director', label: 'Giám đốc' },
	{ value: 'reviewer', label: 'Thẩm định' },
	{ value: 'manager', label: 'Quản lý' },
	{ value: 'dept', label: 'TK Khoa' },
	{ value: 'member', label: 'Thành viên' },
];

export const ACCOUNT_TYPE_CFG: Record<
	AccountType,
	{ label: string; cls: string; avatarCls: string }
> = {
	admin: { label: 'Quản trị', cls: 'rolePurple', avatarCls: 'avatarPurple' },
	director: { label: 'Giám đốc', cls: 'roleRed', avatarCls: 'avatarRed' },
	reviewer: { label: 'Thẩm định', cls: 'roleGray', avatarCls: 'avatarGray' },
	manager: { label: 'Quản lý', cls: 'roleBlue', avatarCls: 'avatarBlue' },
	dept: { label: 'TK Khoa', cls: 'roleAmber', avatarCls: 'avatarAmber' },
	member: { label: 'Thành viên', cls: 'roleGreen', avatarCls: 'avatarGreen' },
};


export function isPasswordOld(dateStr: string | null): boolean {
	if (!dateStr) return true;
	const d = new Date(dateStr);
	if (isNaN(d.getTime())) return true;
	return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24) > 90;
}

export function removeDiacritics(str: string) {
	return str
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/gi, 'd')
		.toLowerCase();
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
