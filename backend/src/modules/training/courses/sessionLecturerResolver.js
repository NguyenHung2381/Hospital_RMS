/**
 * sessionLecturerResolver.js — Tìm giảng viên cho từng dòng file "Nhập giảng viên giảng dạy
 * theo buổi" (sessionLecturerImportService): theo Mã nhân viên (đối chiếu họ tên) hoặc theo
 * họ tên với chuyên gia ngoài viện không có mã.
 */
const { norm } = require('../../../utils/vietnameseText');
const { splitTitle } = require('../programs/programLessonLecturerImportService');

const tidy = (s) =>
	String(s || '')
		.replace(/\s+/g, ' ')
		.trim();

const groupBy = (items, keyOf) => {
	const map = new Map();
	for (const item of items) {
		const key = keyOf(item);
		if (!map.has(key)) map.set(key, []);
		map.get(key).push(item);
	}
	return map;
};

const isOn = (v) => v === true || v === 1 || v === 'true';
const nameKeyOf = (fullName) => norm(splitTitle(fullName).name);

/** Mã nhân viên (+ họ tên để đối chiếu) → giảng viên. */
const createStaffResolver = ({ lecturers, staff }) => {
	const staffByNumber = groupBy(staff, (u) => Number(u.staff_number));
	const lecturersByUser = groupBy(
		lecturers.filter((l) => l.user_id),
		(l) => l.user_id,
	);
	return (num, rawName) => {
		const all = staffByNumber.get(num) || [];
		const active = all.filter((u) => isOn(u.is_active));
		if (!active.length)
			return {
				error: all.length
					? `mã nhân viên ${num} thuộc tài khoản đã khóa / ngừng hoạt động`
					: `mã nhân viên ${num} không có trong hệ thống`,
			};
		if (active.length > 1) return { error: `mã nhân viên ${num} trùng ${active.length} tài khoản` };
		const [user] = active;
		if (rawName && nameKeyOf(rawName) !== nameKeyOf(user.full_name))
			return {
				error: `mã nhân viên ${num} là "${user.full_name}", khác họ tên "${rawName}" trong file — kiểm tra lại mã hoặc họ tên`,
			};
		const profiles = lecturersByUser.get(user.id) || [];
		const lecturer = profiles.find((l) => isOn(l.is_active));
		if (lecturer) return { id: lecturer.id, name: lecturer.full_name, staff_number: num };
		if (profiles.length)
			return { error: `hồ sơ giảng viên của "${user.full_name}" (mã ${num}) đã ngừng hoạt động` };
		if (!isOn(user.has_license))
			return {
				error: `"${user.full_name}" (mã ${num}) chưa có hồ sơ giảng viên và chưa có CCHN — thêm ở mục Giảng viên trước`,
			};
		// Phân công thì tự tạo hồ sơ GV (lecturerAssignmentService.resolveLecturerId)
		return { id: `user:${user.id}`, name: user.full_name, staff_number: num, is_new: true };
	};
};

/** Họ tên → giảng viên: ứng viên của khóa trước, rồi cả danh mục. */
const createLecturerResolver = ({ candidates, lecturers }) => {
	const nameKey = nameKeyOf;
	const byCandidate = groupBy(candidates, (l) => nameKey(l.full_name));
	const byCatalog = groupBy(
		lecturers.filter((l) => isOn(l.is_active)),
		(l) => nameKey(l.full_name),
	);
	return (raw) => {
		const key = nameKey(raw);
		const inCourse = byCandidate.get(key) || [];
		const pick = inCourse.length > 1 ? inCourse.filter((l) => l.group === 'department') : inCourse;
		if (pick.length === 1) return { id: pick[0].id, name: pick[0].full_name };
		if (inCourse.length > 1)
			return { error: `trùng tên ${inCourse.length} giảng viên — sửa họ tên cho khớp danh mục` };
		const anywhere = byCatalog.get(key) || [];
		if (anywhere.length === 1) return { id: anywhere[0].id, name: anywhere[0].full_name };
		if (anywhere.length > 1)
			return { error: `trùng tên ${anywhere.length} giảng viên trong danh mục` };
		return {
			error:
				'không có trong danh mục Giảng viên (hoặc nhân viên có CCHN của khoa) — thêm ở mục Giảng viên trước',
		};
	};
};

// Ô giảng viên ghi nhiều người: "A; B", "A, B", "A và B", "A + B"
const splitLecturerCell = (raw) =>
	String(raw || '')
		.split(/\s*(?:[;,]|\s\+\s|\svà\s)\s*/i)
		.map(tidy)
		.filter(Boolean);

// Ô mã nhân viên ghi nhiều người: "123; 456"
const splitStaffCell = (raw) =>
	String(raw || '')
		.split(/\s*(?:[;,/]|\s\+\s|\svà\s)\s*/i)
		.map(tidy)
		.filter(Boolean);

module.exports = {
	nameKeyOf,
	createStaffResolver,
	createLecturerResolver,
	splitLecturerCell,
	splitStaffCell,
};
