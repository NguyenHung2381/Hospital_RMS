// Kiểm tra cấu trúc số CCCD 12 số và đối chiếu với giới tính / năm sinh đã khai.
// Số thứ 4: 0 nam 19xx, 1 nữ 19xx, 2 nam 20xx, 3 nữ 20xx, 4 nam 21xx, 5 nữ 21xx; số 5–6 = 2 số cuối năm sinh.
// CMND 9 số (cũ) chỉ kiểm định dạng. Giữ giống backend/src/utils/nationalId.js.

export type NationalIdIssue = 'format' | 'gender' | 'birth_year';

export interface NationalIdCheck {
	valid: boolean;
	legacy: boolean;
	issues: NationalIdIssue[];
}

export const NATIONAL_ID_ISSUE_MESSAGE: Record<NationalIdIssue, string> = {
	format: 'Số CCCD phải gồm đúng 12 chữ số (hoặc 9 chữ số với CMND cũ).',
	gender: 'Số CCCD không khớp với giới tính đã chọn.',
	birth_year: 'Số CCCD không khớp với năm sinh đã nhập.',
};

export function checkNationalId(
	value: string,
	declared: { dob?: string | null; gender?: string | null } = {},
): NationalIdCheck {
	const id = value.trim();
	if (/^\d{9}$/.test(id)) return { valid: true, legacy: true, issues: [] };
	if (!/^\d{12}$/.test(id)) return { valid: false, legacy: false, issues: ['format'] };

	const marker = Number(id[3]);
	if (marker > 5) return { valid: false, legacy: false, issues: ['format'] };

	const issues: NationalIdIssue[] = [];
	if (declared.gender === 'male' || declared.gender === 'female') {
		const isFemale = marker % 2 === 1;
		if (isFemale !== (declared.gender === 'female')) issues.push('gender');
	}
	const year = declared.dob ? Number(declared.dob.slice(0, 4)) : NaN;
	if (Number.isInteger(year)) {
		const expected = 1900 + Math.floor(marker / 2) * 100 + Number(id.slice(4, 6));
		if (expected !== year) issues.push('birth_year');
	}
	return { valid: issues.length === 0, legacy: false, issues };
}
