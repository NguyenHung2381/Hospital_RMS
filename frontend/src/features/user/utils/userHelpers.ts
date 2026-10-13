import { removeDiacritics } from '../../../shared/utils/helper';

// Màu / nhãn vai trò: dùng roleCfg ở shared/utils/roleDisplay.ts (tra theo mã vai trò).

// Khớp buildMemberUsername ở backend: "Nguyễn Văn An" + "123" → "NVA_0123"; không có MNV → "NVA".
export function suggestUsername(fullName: string, staffNumber: string): string {
	const name = fullName.slice(fullName.lastIndexOf('.') + 1); // bỏ học vị "PGS.TS."
	const initials = removeDiacritics(name)
		.split(/\s+/)
		.map((w) => w.charAt(0))
		.join('')
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '');
	const code = staffNumber.trim();
	return initials && code ? `${initials}_${code.padStart(4, '0')}` : initials;
}
