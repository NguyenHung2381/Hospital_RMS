/**
 * traineeImportService.js — Nhập danh sách học viên hàng loạt từ file Excel.
 * Mirror cơ chế seminarImportService.js (dò dòng tiêu đề, khớp cột gần đúng,
 * dry_run trả preview, commit mới ghi DB) — đối chiếu QLNCKHDTCDT-main
 * (DM_HocVien::importExcel) vốn có tính năng này nhưng RMS trước đây chưa có.
 *
 * Nhận được cả sổ thực hành GPHN (3.xlsx): cột "CMT/CCCD", giới tính ghi
 * "ông"/"bà", "Hộ khẩu thường trú", "Ngày cấp"/"Nơi cấp" (CCCD — khác "Ngày
 * cấp bằng", "Ngày cấp CCHN n"), "Nơi sinh (Tỉnh)", "Mã học viên".
 * Học viên đã có CCCD trong hệ thống thì CẬP NHẬT (chỉ các ô có giá trị),
 * nên nhập lại cùng một file nhiều lần vẫn an toàn.
 */
const { getPool } = require('../../../config/db');
const { norm, normDept } = require('../../../utils/vietnameseText');
const { parseDob, parseDateCell, readSheet } = require('../../../utils/excelImport');
const { normalizeGender } = require('../../../utils/gender');
const traineeService = require('./traineeService');
const { httpError } = require('../../../utils/httpError');

const COLUMN_MATCHERS = [
	['stt', (h) => h === 'stt' || h === 'tt' || h === 'so tt'],
	['legacy_code', (h) => h === 'ma hoc vien'],
	['full_name', (h) => h === 'ho va ten' || h === 'ho ten' || h === 'ten hoc vien'],
	['dob', (h) => h.includes('ngay sinh') || h === 'sinh ngay' || h === 'nam sinh'],
	['gender', (h) => h === 'gioi tinh' || h === 'phai'],
	[
		'national_id',
		(h) =>
			h === 'cccd' ||
			h === 'so cccd' ||
			h.includes('can cuoc') ||
			h === 'cmnd' ||
			h === 'so cmnd' ||
			h === 'cmt' ||
			h === 'cmt cccd' ||
			h === 'cmnd cccd',
	],
	// Khớp ĐÚNG chữ — tránh nhầm "Ngày cấp bằng", "Ngày cấp CCHN 1", "Nơi cấp QĐ…"
	['national_id_issued_date', (h) => h === 'ngay cap' || h === 'ngay cap cccd'],
	['national_id_issued_place', (h) => h === 'noi cap' || h === 'noi cap cccd'],
	['phone', (h) => h === 'so dien thoai' || h === 'dien thoai' || h === 'sdt'],
	['email', (h) => h === 'email' || h === 'thu dien tu'],
	['address', (h) => h === 'dia chi'],
	['permanent_address', (h) => h.includes('dia chi thuong tru') || h === 'ho khau thuong tru'],
	['birth_province', (h) => h.startsWith('noi sinh')],
	['trainee_type_raw', (h) => h.includes('doi tuong hoc vien') || h === 'doi tuong'],
	[
		'department_raw',
		(h) => h === 'khoa phong' || h === 'khoa' || h === 'don vi cong tac' || h === 'phong ban',
	],
	['qualification', (h) => h.includes('trinh do chuyen mon') || h === 'trinh do'],
	['graduated_school', (h) => h.includes('truong dao tao') || h.includes('truong tot nghiep')],
	['graduated_year', (h) => h.includes('nam tot nghiep')],
	['graduated_date', (h) => h === 'ngay tot nghiep'],
	['degree_issued_date', (h) => h === 'ngay cap bang'],
	['is_employee_raw', (h) => h.includes('la nhan vien') || h === 'nhan vien'],
	['notes', (h) => h === 'ghi chu'],
];

const NEGATIVE_TEXT = new Set(['khong', 'k', '0', 'no', 'false']);
const parseIsEmployee = (raw) => {
	const v = norm(raw || '').trim();
	if (!v) return false;
	return !NEGATIVE_TEXT.has(v);
};

// CCCD hay bị Excel lưu dạng số (mất số 0 đầu) hoặc chèn khoảng trắng — chỉ giữ chữ số/chữ cái.
const cleanNationalId = (s) => {
	const t = String(s || '').replace(/[\s.'-]/g, '');
	if (!t) return null;
	return /^\d{11}$/.test(t) ? `0${t}` : t; // CCCD 12 số bị mất số 0 đầu
};

const parseWorkbook = async (buffer) => {
	const { cols, rows: sheetRows } = await readSheet(buffer, {
		matchers: COLUMN_MATCHERS,
		isValid: (c) => !!c.full_name,
		headerError:
			'Không tìm thấy dòng tiêu đề (cần ít nhất cột "Họ và tên"; các cột nhận diện: Ngày sinh, Giới tính, CCCD, SĐT, Email, Địa chỉ, Đối tượng học viên, Khoa/phòng, Trình độ, Trường đào tạo, Năm tốt nghiệp, Ghi chú).',
		isEmpty: (get, row) => !get(row, 'full_name'),
	});
	const dateOf = (row, field) => (cols[field] ? parseDateCell(row.getCell(cols[field])) : null);

	const rows = [];
	for (const { r, row, get } of sheetRows) {
		const fullName = get(row, 'full_name');
		const { dob, dob_text } = parseDob(cols.dob ? row.getCell(cols.dob) : null);
		const graduatedYearRaw = get(row, 'graduated_year');
		rows.push({
			row: r,
			full_name: fullName,
			dob,
			dob_text,
			gender: normalizeGender(get(row, 'gender')),
			national_id: cleanNationalId(get(row, 'national_id')),
			national_id_issued_date: dateOf(row, 'national_id_issued_date'),
			national_id_issued_place: get(row, 'national_id_issued_place') || null,
			phone: get(row, 'phone') || null,
			email: get(row, 'email') || null,
			address: get(row, 'address') || null,
			permanent_address: get(row, 'permanent_address') || null,
			birth_province: get(row, 'birth_province') || null,
			trainee_type_raw: get(row, 'trainee_type_raw') || null,
			department_raw: get(row, 'department_raw') || null,
			qualification: get(row, 'qualification') || null,
			graduated_school: get(row, 'graduated_school') || null,
			graduated_year: /^\d{4}$/.test(graduatedYearRaw) ? Number(graduatedYearRaw) : null,
			graduated_date: dateOf(row, 'graduated_date'),
			degree_issued_date: dateOf(row, 'degree_issued_date'),
			legacy_code: get(row, 'legacy_code') || null,
			is_employee: parseIsEmployee(get(row, 'is_employee_raw')),
			notes: get(row, 'notes') || null,
		});
	}
	if (!rows.length) {
		throw httpError(400, 'File không có dòng dữ liệu nào.');
	}
	return { rows, matchedColumns: Object.keys(cols) };
};

const loadLookups = async () => {
	const pool = await getPool();
	const [types, depts, existing] = await Promise.all([
		pool.request().query('SELECT id, name FROM trainee_types'),
		pool.request().query('SELECT id, name FROM departments'),
		pool
			.request()
			.query(
				'SELECT id, national_id, hidden_at FROM trainees WHERE national_id IS NOT NULL ORDER BY created_at',
			),
	]);
	const typeByName = new Map(types.recordset.map((t) => [norm(t.name), t.id]));
	const deptByName = new Map(depts.recordset.map((d) => [normDept(d.name), d.id]));
	const traineeByNationalId = new Map();
	for (const t of existing.recordset)
		if (!traineeByNationalId.has(t.national_id)) traineeByNationalId.set(t.national_id, t);
	return { typeByName, deptByName, traineeByNationalId };
};

const buildPreview = (rows, lookups) => {
	const seenNationalIds = new Map(); // CCCD → dòng đầu tiên trong file
	return rows.map((row) => {
		const warnings = [];
		const traineeTypeId = row.trainee_type_raw
			? lookups.typeByName.get(norm(row.trainee_type_raw))
			: null;
		if (row.trainee_type_raw && !traineeTypeId) {
			warnings.push(`Không khớp đối tượng học viên "${row.trainee_type_raw}" — để trống.`);
		}
		const departmentId = row.department_raw
			? lookups.deptByName.get(normDept(row.department_raw))
			: null;
		if (row.department_raw && !departmentId) {
			warnings.push(`Không khớp khoa/phòng "${row.department_raw}" — để trống.`);
		}
		if (!row.dob && row.dob_text) {
			warnings.push(`Ngày sinh "${row.dob_text}" không đủ dạng ngày — bỏ qua.`);
		}
		if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
			warnings.push(`Email "${row.email}" không hợp lệ — bỏ qua.`);
			row.email = null;
		}

		// Học viên đã có (theo CCCD) → cập nhật; CCCD lặp lại trong file (1 người nhiều
		// hồ sơ thực hành) → các dòng sau chỉ cập nhật lại cùng 1 học viên.
		const existing = row.national_id ? lookups.traineeByNationalId.get(row.national_id) : null;
		const firstRow = row.national_id ? seenNationalIds.get(row.national_id) : undefined;
		let action = existing ? 'update' : 'new';
		if (firstRow !== undefined) {
			action = 'duplicate';
			warnings.push(`Trùng CCCD với dòng ${firstRow} — cập nhật chung 1 học viên.`);
		} else if (row.national_id) seenNationalIds.set(row.national_id, row.row);
		if (existing?.hidden_at) warnings.push('Học viên này đang bị ẩn khỏi danh sách.');

		return {
			...row,
			action,
			trainee_id: existing?.id ?? null,
			trainee_type_id: traineeTypeId || null,
			department_id: departmentId || null,
			warnings,
		};
	});
};

const WRITE_FIELDS = [
	'full_name',
	'dob',
	'gender',
	'national_id',
	'national_id_issued_date',
	'national_id_issued_place',
	'phone',
	'email',
	'address',
	'permanent_address',
	'birth_province',
	'trainee_type_id',
	'department_id',
	'qualification',
	'graduated_school',
	'graduated_year',
	'graduated_date',
	'degree_issued_date',
	'legacy_code',
	'notes',
];

// Cập nhật: chỉ ghi ô có giá trị — ô trống trong file không xoá dữ liệu đang có.
const filledFields = (p) =>
	Object.fromEntries(WRITE_FIELDS.filter((f) => p[f] != null && p[f] !== '').map((f) => [f, p[f]]));

/**
 * Ghi các dòng đã xem trước: CCCD đã có → cập nhật, chưa có → thêm mới; CCCD lặp
 * trong file → cùng 1 học viên. Trả idByRow (số dòng Excel → id học viên) để
 * nơi gọi gắn tiếp dữ liệu khác (vd sổ thực hành GPHN).
 */
const writeTrainees = async (preview, actorId) => {
	let inserted = 0;
	let updated = 0;
	const idByNationalId = new Map();
	const idByRow = new Map();
	for (const p of preview) {
		const targetId = p.trainee_id ?? (p.national_id ? idByNationalId.get(p.national_id) : null);
		if (targetId) {
			await traineeService.update(targetId, filledFields(p), actorId);
			idByRow.set(p.row, targetId);
			updated += 1;
			continue;
		}
		const created = await traineeService.create(
			{ ...filledFields(p), is_employee: p.is_employee },
			actorId,
			{ fetch: false },
		);
		if (p.national_id) idByNationalId.set(p.national_id, created.id);
		idByRow.set(p.row, created.id);
		inserted += 1;
	}
	return { inserted, updated, idByRow };
};

const importExcel = async ({ buffer, dry_run }, actorId) => {
	const { rows: rawRows } = await parseWorkbook(buffer);
	const lookups = await loadLookups();
	const preview = buildPreview(rawRows, lookups);

	const warnings = [];
	for (const p of preview) {
		for (const w of p.warnings) {
			warnings.push(`Dòng ${p.row} (${p.full_name}): ${w}`);
		}
	}

	const summary = {
		total: preview.length,
		new: preview.filter((p) => p.action === 'new').length,
		update: preview.filter((p) => p.action !== 'new').length,
		matched_type: preview.filter((p) => p.trainee_type_id).length,
		matched_department: preview.filter((p) => p.department_id).length,
	};

	if (dry_run) {
		return { dry_run: true, rows: preview, summary, warnings };
	}

	const { inserted, updated } = await writeTrainees(preview, actorId);
	return { dry_run: false, inserted, updated, warnings };
};

module.exports = {
	importExcel,
	COLUMN_MATCHERS,
	parseWorkbook,
	buildPreview,
	loadLookups,
	writeTrainees,
};
