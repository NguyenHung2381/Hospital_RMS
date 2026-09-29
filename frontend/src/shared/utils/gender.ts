/* Giới tính: DB lưu mã ASCII male/female/other (cột VARCHAR — ghi "Nữ" sẽ mất
 * dấu thành "N?"), FE chỉ đổi sang nhãn khi hiển thị. Backend cũng tự chuẩn hoá
 * nhãn tiếng Việt (backend/src/utils/gender.js) nên dữ liệu import vẫn khớp. */

export const GENDER_OPTIONS = [
	{ value: 'male', label: 'Nam' },
	{ value: 'female', label: 'Nữ' },
	{ value: 'other', label: 'Khác' },
] as const;

const GENDER_LABEL: Record<string, string> = {
	male: 'Nam',
	female: 'Nữ',
	other: 'Khác',
	// dữ liệu cũ trước khi chuẩn hoá
	nam: 'Nam',
	nữ: 'Nữ',
	nu: 'Nữ',
	khác: 'Khác',
};

export const genderLabel = (g?: string | null): string | null =>
	g ? (GENDER_LABEL[g.toLowerCase()] ?? g) : null;
