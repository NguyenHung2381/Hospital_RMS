/**
 * practiceBookExportService.js — xuất SỔ THỰC HÀNH GPHN của 1 khóa ra Excel ĐÚNG
 * BỐ CỤC sổ cũ (3.xlsx): cùng tên cột, các cột Ngày/Tháng/Năm (Đ/K) và TH1–TH11 —
 * để phòng Đào tạo vẫn trộn thư Word như trước trong giai đoạn chuyển tiếp.
 * Số nhóm "Khoa thực hành n" = max(11, số vòng nhiều nhất của 1 hồ sơ).
 */
const ExcelJS = require('exceljs');
const { getPool, sql } = require('../../../config/db');
const { norm } = require('../../../utils/vietnameseText');
const { httpError } = require('../../../utils/httpError');
const { describeSpan } = require('./rotationPlanner');

const pad2 = (n) => String(n).padStart(2, '0');
const toDate = (v) =>
	v ? (v instanceof Date ? v : new Date(`${String(v).slice(0, 10)}T00:00:00Z`)) : null;
const dmy = (v) => {
	const d = toDate(v);
	return d && !Number.isNaN(d.getTime())
		? `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
		: '';
};
const parts = (v) => {
	const d = toDate(v);
	return d ? [d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear()] : ['', '', ''];
};
const salutation = (g) => (g === 'male' ? 'ông' : g === 'female' ? 'bà' : '');
// Sổ ghi tên khoa không có chữ "Khoa": "Cấp cứu", "Nội tim mạch 2"
const shortDept = (name) => String(name ?? '').replace(/^\s*khoa\s+/i, '');

/**
 * Nhãn lĩnh vực in lên giấy (cột TH n) — bản JS của công thức IFS trong sổ:
 * Cấp cứu/Chống độc/Hồi sức → "về Hồi sức cấp cứu"; Ngoại/Phẫu thuật/Chấn thương/Bỏng
 * → "lĩnh vực Ngoại khoa"; Nội/Đột quỵ/Nhiệt đới/Huyết học/Thần kinh/Miễn dịch → "lĩnh
 * vực Nội khoa"; Nhi → Nhi khoa; Sản → Sản phụ khoa; chuyên khoa lẻ → "về <tên khoa>".
 */
const practiceFieldLabel = (deptName) => {
	const name = shortDept(deptName).trim();
	const n = norm(name);
	if (!n) return '';
	if (/cap cuu|chong doc|hoi suc/.test(n)) return 'về Hồi sức cấp cứu';
	if (/ngoai|phau thuat|chan thuong|bong/.test(n)) return 'lĩnh vực Ngoại khoa';
	if (/noi|dot quy|nhiet doi|huyet hoc|than kinh|mien dich/.test(n)) return 'lĩnh vực Nội khoa';
	if (/\bnhi\b/.test(n)) return 'lĩnh vực Nhi khoa';
	if (/san/.test(n)) return 'lĩnh vực Sản phụ khoa';
	if (/tai mui hong|rang ham mat|\bmat\b|da lieu|y hoc co truyen|phuc hoi chuc nang/.test(n))
		return `về ${name}`;
	return 'Khác';
};

const HEAD = [
	'TT', 'Mã học viên', 'Mã thực hành', 'Họ và tên', 'Giới tính', 'Ngày sinh', 'Năm sinh', 'Trình độ chuyên môn',
	'Hộ khẩu thường trú', 'Nơi sinh \n(Tỉnh)', 'CMT/CCCD', 'Ngày cấp', 'Nơi cấp', 'Điện thoại', 'Năm tốt nghiệp',
	'Trường đào tạo', 'Ngày cấp bằng', 'Ngày tốt nghiệp', 'Lĩnh vực chuyên môn', 'Hình thức hành nghề',
	'Tổng Thời gian thực hành', 'Ngày bắt đầu', 'Ngày (Đ)', 'Tháng (Đ)', 'Năm (Đ)', 'Ngày kết thúc', 'Ngày (K)',
	'Tháng (K)', 'Năm (K)', 'Địa điểm thực hành',
]; // prettier-ignore

const rotationHead = (n) => [
	`Khoa thực hành ${n}`, `Thời gian bắt đầu khoa ${n}`, `Thời gian kết thúc khoa ${n}`, `Tổng thời gian khoa ${n}`,
	`Người hướng dẫn ${n}`, `ông/bà ${n}`, `MNV ${n}`, `Ngày sinh Ng hướng dẫn ${n}`,
	n === 1 ? 'TDCM \nng hướng dẫn 1' : `TDCM ng hướng dẫn ${n}`, `Số CCHN ${n}`, `Ngày cấp CCHN ${n}`,
	`Điện thoại ${n}`, `PVHĐCM của NHD TH ${n}`,
]; // prettier-ignore

const MAIN_HEAD = [
	'Người hướng dẫn chính (DD, KTV)', 'ông/bà chính', 'MNV chính', 'Ngày sinh Ng hướng dẫn chính',
	'TDCM ng hướng dẫn chính', 'Số CCHN chính', 'Ngày cấp CCHN chính', 'Điện thoại chính',
	'Phạm vi hoạt động chuyên môn của người hướng dẫn thực hành chính',
]; // prettier-ignore

const rotationCells = (r) =>
	r
		? [
				shortDept(r.department_name),
				dmy(r.start_date),
				dmy(r.end_date),
				r.duration_text || describeSpan(r.start_date, r.end_date) || '',
				r.mentor_name ?? '',
				r.mentor_salutation ?? '',
				r.mentor_staff_no ?? '',
				dmy(r.mentor_dob),
				r.mentor_qualification ?? '',
				r.mentor_license_no ?? '',
				dmy(r.mentor_license_date),
				r.mentor_phone ?? '',
				r.mentor_scope ?? '',
			]
		: Array(13).fill('');

const load = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT name FROM courses WHERE id = @course_id;
    SELECT e.*, t.legacy_code, t.full_name, t.gender, t.dob, t.qualification, t.permanent_address, t.address,
           t.birth_province, t.national_id, t.national_id_issued_date, t.national_id_issued_place, t.phone,
           t.graduated_year, t.graduated_school, t.degree_issued_date, t.graduated_date,
           mm.full_name AS main_mentor_name, mm.staff_number AS main_mentor_staff_no, mm.date_of_birth AS main_mentor_dob,
           mm.gender AS main_mentor_gender, mm.phone_number AS main_mentor_phone,
           sl.license_no AS main_license_no, sl.issued_date AS main_license_date, sl.qualification AS main_qualification,
           COALESCE(sl.practice_scope, sl.adjusted_scope) AS main_scope
    FROM course_enrollments e
    JOIN trainees t ON t.id = e.trainee_id
    LEFT JOIN users mm ON mm.id = e.main_mentor_user_id
    LEFT JOIN staff_practice_licenses sl ON sl.user_id = mm.id
    WHERE e.course_id = @course_id;
    SELECT r.* FROM enrollment_rotations r
    JOIN course_enrollments e ON e.id = r.enrollment_id
    WHERE e.course_id = @course_id AND r.result <> 'fail'
    ORDER BY r.enrollment_id, r.seq, r.created_at;
  `);
	const [[course], enrollments, rotations] = r.recordsets;
	if (!course) throw httpError(404, 'Khóa học không tồn tại.');
	const byEnrollment = new Map();
	for (const rot of rotations)
		byEnrollment.set(rot.enrollment_id, [...(byEnrollment.get(rot.enrollment_id) ?? []), rot]);
	// Sắp theo số trong mã thực hành (226.BS, 227.BS…), chưa có mã xếp cuối
	const num = (e) => parseInt((String(e.practice_code ?? '').match(/\d+/) ?? [''])[0], 10);
	enrollments.sort(
		(a, b) =>
			(num(a) || Infinity) - (num(b) || Infinity) ||
			String(a.full_name).localeCompare(b.full_name, 'vi'),
	);
	return { course, enrollments, byEnrollment };
};

const buildWorkbook = ({ enrollments, byEnrollment }) => {
	const groups = Math.max(11, ...enrollments.map((e) => (byEnrollment.get(e.id) ?? []).length));
	const header = [
		...HEAD,
		...Array.from({ length: groups }, (_, i) => rotationHead(i + 1)).flat(),
		...MAIN_HEAD,
		'Ghi chú',
		'đã hoàn thành',
		'nghỉ học',
		...Array.from({ length: groups }, (_, i) => `TH${i + 1}`),
	];
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('Sheet1');
	ws.addRow(header);
	ws.getRow(1).font = { bold: true };
	ws.getRow(1).alignment = { wrapText: true, vertical: 'middle' };

	enrollments.forEach((e, idx) => {
		const rots = byEnrollment.get(e.id) ?? [];
		const dob = toDate(e.dob);
		const row = [
			idx + 1,
			e.legacy_code ?? '',
			e.practice_code ?? '',
			e.full_name,
			salutation(e.gender),
			dmy(e.dob),
			dob ? dob.getUTCFullYear() : '',
			e.qualification ?? '',
			e.permanent_address || e.address || '',
			e.birth_province ?? '',
			e.national_id ?? '',
			dmy(e.national_id_issued_date),
			e.national_id_issued_place ?? '',
			e.phone ?? '',
			e.graduated_year ?? '',
			e.graduated_school ?? '',
			dmy(e.degree_issued_date),
			dmy(e.graduated_date),
			e.professional_field ?? '',
			e.practice_form ?? '',
			e.total_duration || describeSpan(e.start_date, e.end_date) || '',
			dmy(e.start_date),
			...parts(e.start_date),
			dmy(e.end_date),
			...parts(e.end_date),
			e.practice_location ||
				(rots.length
					? `Tại các khoa: ${[...new Set(rots.map((r) => shortDept(r.department_name)))].join(', ')}`
					: ''),
			...Array.from({ length: groups }, (_, i) => rotationCells(rots[i])).flat(),
			e.main_mentor_name ?? '',
			salutation(e.main_mentor_gender),
			e.main_mentor_staff_no ?? '',
			dmy(e.main_mentor_dob),
			e.main_qualification ?? '',
			e.main_license_no ?? '',
			dmy(e.main_license_date),
			e.main_mentor_phone ?? '',
			e.main_scope ?? '',
			e.sending_unit ?? '',
			e.progress_status === 'completed' ? 'x' : '',
			e.progress_status === 'dropped' ? 'x' : '',
			...Array.from({ length: groups }, (_, i) =>
				rots[i] ? practiceFieldLabel(rots[i].department_name) : 'Khác',
			),
		];
		ws.addRow(row);
	});
	ws.views = [{ state: 'frozen', xSplit: 4, ySplit: 1 }];
	ws.columns.forEach((c) => (c.width = 16));
	return wb;
};

const exportBook = async (courseId) => {
	const data = await load(courseId);
	const wb = buildWorkbook(data);
	return {
		buffer: await wb.xlsx.writeBuffer(),
		courseName: data.course.name,
		count: data.enrollments.length,
	};
};

module.exports = { exportBook, buildWorkbook, practiceFieldLabel };
