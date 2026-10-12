import { removeDiacritics as stripDiacritics } from '../../../shared/utils/helper';

// Màu / nhãn vai trò: dùng roleCfg ở shared/utils/roleDisplay.ts (tra theo mã vai trò).


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
