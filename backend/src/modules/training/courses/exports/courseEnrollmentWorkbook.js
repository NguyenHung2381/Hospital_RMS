// courseEnrollmentWorkbook.js — dựng workbook cho POST /api/v1/courses/:id/enrollments/export-excel.
// Hàm thuần (không đụng CSDL): nhận dữ liệu đã đọc sẵn, trả về workbook exceljs.
const { lazyRequire } = require('../../../../utils/lazyRequire');
/** @type {typeof import('exceljs')} */
const ExcelJS = lazyRequire('exceljs');
const xl = require('../../../../utils/excelTemplate');

const UNASSIGNED_SHEET = 'Chưa xếp chương trình';

const STATUS_LABEL = {
	pending: 'Chờ duyệt',
	approved: 'Đã duyệt',
	rejected: 'Từ chối',
	waitlisted: 'Danh sách chờ',
};
const STATUSES = Object.keys(STATUS_LABEL);

// Ngày DATE / timestamp đọc ra từ PG là Date mà phần UTC chính là ngày giờ VN (xem backend/README.md
// mục "Giờ") ⇒ đọc bằng getter UTC, KHÔNG cộng thêm múi giờ nữa kẻo lệch ngày.
const pad2 = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => {
	if (!d) return '';
	const dt = d instanceof Date ? d : new Date(d);
	if (isNaN(dt.getTime())) return '';
	return `${pad2(dt.getUTCDate())}/${pad2(dt.getUTCMonth() + 1)}/${dt.getUTCFullYear()}`;
};

const GENDER_LABEL = { male: 'Nam', female: 'Nữ', other: 'Khác' };

// Slug không dấu, chữ thường, dùng cho tên file.
const slugify = (s) =>
	String(s ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/g, 'd')
		.replace(/Đ/g, 'D')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

const fileNameOf = (courseName) => `danh-sach-hoc-vien-${slugify(courseName) || 'khoa-hoc'}.xlsx`;

// Tên Việt: "tên" là từ cuối của họ tên.
const givenName = (fullName) => {
	const parts = String(fullName ?? '')
		.trim()
		.split(/\s+/);
	return parts[parts.length - 1] || '';
};
const cmpVi = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'vi');
const compareByName = (a, b) =>
	cmpVi(givenName(a.full_name), givenName(b.full_name)) || cmpVi(a.full_name, b.full_name);
// Không đổi mảng gốc.
const sortByName = (rows) => [...rows].sort(compareByName);

// Tên sheet Excel: ≤ 31 ký tự, bỏ ký tự cấm [ ] : * ? / \, không trùng (không phân biệt hoa-thường).
const safeSheetName = (raw, used) => {
	let base =
		String(raw ?? '')
			.replace(/[[\]:*?/\\]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.replace(/^'+|'+$/g, '') || 'Sheet';
	base = base.slice(0, 31).trim();
	let name = base;
	for (let n = 2; used.has(name.toLowerCase()); n++) {
		const suffix = ` (${n})`;
		name = base.slice(0, 31 - suffix.length).trim() + suffix;
	}
	used.add(name.toLowerCase());
	return name;
};

const programLabel = (p) => (p.code ? `${p.code} – ${p.name}` : (p.name ?? ''));

const buildColumns = ({ includeProgram, includeNationalId }) => {
	const cols = [
		{ key: 'stt', header: 'STT', width: 6 },
		{ key: 'full_name', header: 'Họ và tên', width: 28 },
		{ key: 'dob', header: 'Ngày sinh', width: 13 },
		{ key: 'gender', header: 'Giới tính', width: 10 },
	];
	if (includeNationalId) cols.push({ key: 'national_id', header: 'Số CCCD', width: 16 });
	cols.push(
		{ key: 'phone', header: 'Điện thoại', width: 15 },
		{ key: 'email', header: 'Email', width: 28 },
		{ key: 'workplace', header: 'Đơn vị công tác / Khoa', width: 32 },
		{ key: 'qualification', header: 'Trình độ', width: 20 },
		{ key: 'audience', header: 'Đối tượng', width: 12 },
	);
	if (includeProgram) cols.push({ key: 'program', header: 'Chương trình', width: 34 });
	cols.push(
		{ key: 'status', header: 'Trạng thái', width: 14 },
		{ key: 'registered_at', header: 'Ngày đăng ký', width: 14 },
	);
	return cols;
};

// Nội viện: tên khoa (rơi về workplace nếu thiếu); ngoại viện: workplace.
const workplaceOf = (r) =>
	r.is_internal ? r.department_name || r.workplace || '' : r.workplace || '';

// presorted: rows đã được sắp (chế độ toàn khóa sắp theo chương trình trước) ⇒ không sắp lại theo tên.
const addTraineeRows = (ws, rows, { includeProgram, includeNationalId }, presorted = false) => {
	(presorted ? rows : sortByName(rows)).forEach((r, i) => {
		const row = {
			stt: i + 1,
			full_name: r.full_name ?? '',
			dob: fmtDate(r.dob),
			gender: GENDER_LABEL[r.gender] ?? '',
			phone: r.phone ?? '',
			email: r.email ?? '',
			workplace: workplaceOf(r),
			qualification: r.qualification ?? '',
			audience: r.is_internal ? 'Nội viện' : 'Ngoại viện',
			status: STATUS_LABEL[r.status] ?? r.status ?? '',
			registered_at: fmtDate(r.registered_at),
		};
		// Chuỗi để Excel không cắt số 0 đầu của CCCD / điện thoại
		if (includeNationalId) row.national_id = r.national_id ? String(r.national_id) : '';
		if (includeProgram)
			row.program = r.program_id
				? programLabel({ code: r.program_code, name: r.program_name })
				: '';
		ws.addRow(row);
	});
	xl.styleBody(ws);
};

const timeRange = (course) => {
	const from = fmtDate(course.start_date);
	const to = fmtDate(course.end_date);
	if (from && to) return `${from} – ${to}`;
	return from || to || '';
};

/**
 * data: {
 *   mode: 'course' | 'program',
 *   course: { name, start_date, end_date },
 *   programs: [{ id, code, name }]  — thứ tự chương trình cần có sheet (chế độ 'program'),
 *   rows: [{ full_name, dob, gender, national_id, phone, email, workplace, department_name,
 *            qualification, is_internal, program_id, program_code, program_name, status, registered_at }],
 *   includeNationalId: boolean,
 * }
 */
const buildCourseEnrollmentWorkbook = (data) => {
	const { mode = 'course', course = {}, rows = [], includeNationalId = false } = data;
	const wb = new ExcelJS.Workbook();

	if (mode !== 'program') {
		const opts = { includeProgram: true, includeNationalId };
		const columns = buildColumns(opts);
		// Thứ tự chương trình: theo danh sách programs của khóa, chương trình lạ + chưa xếp đứng cuối
		const order = new Map((data.programs ?? []).map((p, i) => [p.id, i]));
		const rank = (r) => (r.program_id ? (order.get(r.program_id) ?? order.size) : order.size + 1);
		const ordered = [...rows].sort(
			(a, b) => rank(a) - rank(b) || cmpVi(a.program_name, b.program_name) || compareByName(a, b),
		);
		const ws = xl.buildSheet(wb, {
			sheetName: 'Danh sách học viên',
			title: 'DANH SÁCH HỌC VIÊN',
			subtitle: [course.name, timeRange(course), `${rows.length} học viên`]
				.filter(Boolean)
				.join(' · '),
			columns,
		});
		addTraineeRows(ws, ordered, opts, true);
		return wb;
	}

	const opts = { includeProgram: false, includeNationalId };
	const columns = buildColumns(opts);
	const used = new Set();
	const byProgram = new Map();
	const unassigned = [];
	for (const r of rows) {
		if (!r.program_id) {
			unassigned.push(r);
			continue;
		}
		if (!byProgram.has(r.program_id)) byProgram.set(r.program_id, []);
		byProgram.get(r.program_id).push(r);
	}
	const sheets = [];
	const seen = new Set();
	const addProgram = (p) => {
		if (seen.has(p.id)) return;
		seen.add(p.id);
		sheets.push({
			name: p.code || p.name,
			full: programLabel(p),
			rows: byProgram.get(p.id) ?? [],
		});
	};
	(data.programs ?? []).forEach(addProgram);
	// Học viên thuộc chương trình không nằm trong danh sách (đã gỡ khỏi khóa) vẫn có sheet
	for (const [pid, list] of byProgram)
		addProgram({ id: pid, code: list[0].program_code, name: list[0].program_name });
	if (unassigned.length)
		sheets.push({
			name: UNASSIGNED_SHEET,
			full: 'Học viên chưa xếp chương trình',
			rows: unassigned,
		});

	if (!sheets.length) sheets.push({ name: 'Danh sách học viên', full: '', rows: [] });
	for (const s of sheets) {
		const ws = xl.buildSheet(wb, {
			sheetName: safeSheetName(s.name, used),
			title: 'DANH SÁCH HỌC VIÊN',
			subtitle: [course.name, s.full, `${s.rows.length} học viên`].filter(Boolean).join(' · '),
			columns,
		});
		addTraineeRows(ws, s.rows, opts);
	}
	return wb;
};

module.exports = {
	buildCourseEnrollmentWorkbook,
	STATUS_LABEL,
	STATUSES,
	UNASSIGNED_SHEET,
	fmtDate,
	slugify,
	fileNameOf,
	givenName,
	sortByName,
	safeSheetName,
};
