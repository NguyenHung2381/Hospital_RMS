// Kiểm tra cấu trúc số CCCD 12 số và đối chiếu với giới tính / năm sinh người đăng ký khai.
//   3 số đầu  mã tỉnh nơi đăng ký khai sinh
//   số thứ 4  thế kỷ sinh + giới tính: 0 nam 19xx, 1 nữ 19xx, 2 nam 20xx, 3 nữ 20xx, 4 nam 21xx, 5 nữ 21xx
//   số 5–6    2 số cuối năm sinh
//   6 số cuối số ngẫu nhiên
// CMND 9 số (cũ) không mang thông tin để đối chiếu — chỉ kiểm định dạng.
// Giữ giống frontend/src/shared/utils/nationalId.ts.

const CENTURY_BASE = 1900;

/**
 * @param {string} value số CCCD/CMND
 * @param {{ dob?: string | Date | null, gender?: string | null }} [declared] ngày sinh, giới tính đã khai
 * @returns {{ valid: boolean, legacy: boolean, issues: Array<'format' | 'gender' | 'birth_year'> }}
 */
const checkNationalId = (value, declared = {}) => {
	const id = String(value ?? '').trim();
	if (/^\d{9}$/.test(id)) return { valid: true, legacy: true, issues: [] };
	if (!/^\d{12}$/.test(id)) return { valid: false, legacy: false, issues: ['format'] };

	const issues = [];
	const marker = Number(id[3]);
	if (marker > 5) return { valid: false, legacy: false, issues: ['format'] };

	const gender = declared.gender;
	if (gender === 'male' || gender === 'female') {
		const isFemale = marker % 2 === 1;
		if (isFemale !== (gender === 'female')) issues.push('gender');
	}

	const dob = declared.dob;
	const year =
		dob instanceof Date ? dob.getUTCFullYear() : dob ? Number(String(dob).slice(0, 4)) : NaN;
	if (Number.isInteger(year)) {
		const expected = CENTURY_BASE + Math.floor(marker / 2) * 100 + Number(id.slice(4, 6));
		if (expected !== year) issues.push('birth_year');
	}

	return { valid: issues.length === 0, legacy: false, issues };
};

const NATIONAL_ID_ISSUE_MESSAGE = {
	format: 'Số CCCD phải gồm đúng 12 chữ số (hoặc 9 chữ số với CMND cũ).',
	gender: 'Số CCCD không khớp với giới tính đã chọn.',
	birth_year: 'Số CCCD không khớp với năm sinh đã nhập.',
};

module.exports = { checkNationalId, NATIONAL_ID_ISSUE_MESSAGE };
