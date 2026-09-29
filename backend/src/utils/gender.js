/**
 * gender.js — chuẩn hoá giới tính về mã ASCII lưu DB: 'male' | 'female' | 'other'.
 *
 * Các cột gender (trainees, lecturers, persons, seminar_participants) là
 * VARCHAR(10) và được bind sql.VarChar → ghi thẳng "Nữ" sẽ mất dấu thành "N?".
 * Vì vậy MỌI đường ghi (form admin, form công khai, import Excel, gộp danh tính)
 * đều đi qua normalizeGender; FE tự đổi mã → nhãn "Nam/Nữ/Khác" khi hiển thị.
 */
const { norm } = require('./vietnameseText');

const GENDERS = ['male', 'female', 'other'];

// Nhận cả mã chuẩn lẫn nhãn tiếng Việt/Anh ("Nam", "Nữ", "nu", "F", "Khác"…).
// Giá trị không nhận diện được → null (bỏ trống, không ghi rác vào DB).
const normalizeGender = (v) => {
	if (v == null) return null;
	const n = norm(v);
	if (!n) return null;
	if (GENDERS.includes(n)) return n;
	if (n === 'nam' || n === 'm' || n === 'trai') return 'male';
	if (n === 'nu' || n === 'f' || n === 'gai') return 'female';
	if (n === 'khac') return 'other';
	return null;
};

module.exports = { GENDERS, normalizeGender };
