/**
 * traineeImportService.js — Nhập danh sách học viên hàng loạt từ file Excel.
 * Mirror cơ chế seminarImportService.js (dò dòng tiêu đề, khớp cột gần đúng,
 * dry_run trả preview, commit mới ghi DB) — đối chiếu QLNCKHDTCDT-main
 * (DM_HocVien::importExcel) vốn có tính năng này nhưng RMS trước đây chưa có.
 */
const { getPool } = require('../config/db');
const { norm, normDept } = require('../utils/vietnameseText');
const { parseDob, readSheet } = require('../utils/excelImport');
const { normalizeGender } = require('../utils/gender');
const traineeService = require('./traineeService');

const COLUMN_MATCHERS = [
	['stt', (h) => h === 'stt' || h === 'tt' || h === 'so tt'],
	['full_name', (h) => h === 'ho va ten' || h === 'ho ten' || h === 'ten hoc vien'],
	['dob', (h) => h.includes('ngay sinh') || h === 'sinh ngay' || h === 'nam sinh'],
	['gender', (h) => h === 'gioi tinh' || h === 'phai'],
	['national_id', (h) => h === 'cccd' || h === 'so cccd' || h.includes('can cuoc') || h === 'cmnd' || h === 'so cmnd'],
	['phone', (h) => h === 'so dien thoai' || h === 'dien thoai' || h === 'sdt'],
	['email', (h) => h === 'email' || h === 'thu dien tu'],
	['address', (h) => h === 'dia chi'],
	['permanent_address', (h) => h.includes('dia chi thuong tru')],
	['trainee_type_raw', (h) => h.includes('doi tuong hoc vien') || h === 'doi tuong'],
	['department_raw', (h) => h === 'khoa phong' || h === 'khoa' || h === 'don vi cong tac' || h === 'phong ban'],
	['qualification', (h) => h.includes('trinh do chuyen mon') || h === 'trinh do'],
	['graduated_school', (h) => h.includes('truong dao tao') || h.includes('truong tot nghiep')],
	['graduated_year', (h) => h.includes('nam tot nghiep')],
	['is_employee_raw', (h) => h.includes('la nhan vien') || h === 'nhan vien'],
	['notes', (h) => h === 'ghi chu'],
];

const NEGATIVE_TEXT = new Set(['khong', 'k', '0', 'no', 'false']);
const parseIsEmployee = (raw) => {
	const v = norm(raw || '').trim();
	if (!v) return false;
	return !NEGATIVE_TEXT.has(v);
};

// Nhận "Nam"/"Nữ"/"Khác" trong file → mã lưu DB (xem utils/gender).
const normGender = normalizeGender;

const parseWorkbook = async (buffer) => {
	const { cols, rows: sheetRows } = await readSheet(buffer, {
		matchers: COLUMN_MATCHERS,
		isValid: (c) => !!c.full_name,
		headerError:
			'Không tìm thấy dòng tiêu đề (cần ít nhất cột "Họ và tên"; các cột nhận diện: Ngày sinh, Giới tính, CCCD, SĐT, Email, Địa chỉ, Đối tượng học viên, Khoa/phòng, Trình độ, Trường đào tạo, Năm tốt nghiệp, Ghi chú).',
		isEmpty: (get, row) => !get(row, 'full_name'),
	});

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
			gender: normGender(get(row, 'gender')),
			national_id: get(row, 'national_id') || null,
			phone: get(row, 'phone') || null,
			email: get(row, 'email') || null,
			address: get(row, 'address') || null,
			permanent_address: get(row, 'permanent_address') || null,
			trainee_type_raw: get(row, 'trainee_type_raw') || null,
			department_raw: get(row, 'department_raw') || null,
			qualification: get(row, 'qualification') || null,
			graduated_school: get(row, 'graduated_school') || null,
			graduated_year: /^\d{4}$/.test(graduatedYearRaw) ? Number(graduatedYearRaw) : null,
			is_employee: parseIsEmployee(get(row, 'is_employee_raw')),
			notes: get(row, 'notes') || null,
		});
	}
	if (!rows.length) {
		throw Object.assign(new Error('File không có dòng dữ liệu nào.'), { statusCode: 400 });
	}
	return { rows, matchedColumns: Object.keys(cols) };
};

const loadLookups = async () => {
	const pool = await getPool();
	const [types, depts] = await Promise.all([
		pool.request().query('SELECT id, name FROM trainee_types'),
		pool.request().query('SELECT id, name FROM departments'),
	]);
	const typeByName = new Map(types.recordset.map((t) => [norm(t.name), t.id]));
	const deptByName = new Map(depts.recordset.map((d) => [normDept(d.name), d.id]));
	return { typeByName, deptByName };
};

const buildPreview = (rows, lookups) => {
	return rows.map((row) => {
		const warnings = [];
		const traineeTypeId = row.trainee_type_raw ? lookups.typeByName.get(norm(row.trainee_type_raw)) : null;
		if (row.trainee_type_raw && !traineeTypeId) {
			warnings.push(`Không khớp đối tượng học viên "${row.trainee_type_raw}" — để trống.`);
		}
		const departmentId = row.department_raw ? lookups.deptByName.get(normDept(row.department_raw)) : null;
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
		return {
			row: row.row,
			full_name: row.full_name,
			dob: row.dob,
			dob_text: row.dob_text,
			gender: row.gender,
			national_id: row.national_id,
			phone: row.phone,
			email: row.email,
			address: row.address,
			permanent_address: row.permanent_address,
			trainee_type_id: traineeTypeId || null,
			trainee_type_raw: row.trainee_type_raw,
			department_id: departmentId || null,
			department_raw: row.department_raw,
			qualification: row.qualification,
			graduated_school: row.graduated_school,
			graduated_year: row.graduated_year,
			is_employee: row.is_employee,
			notes: row.notes,
			warnings,
		};
	});
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
		matched_type: preview.filter((p) => p.trainee_type_id).length,
		matched_department: preview.filter((p) => p.department_id).length,
	};

	if (dry_run) {
		return { dry_run: true, rows: preview, summary, warnings };
	}

	let inserted = 0;
	for (const p of preview) {
		await traineeService.create(
			{
				full_name: p.full_name,
				dob: p.dob,
				gender: p.gender,
				national_id: p.national_id,
				phone: p.phone,
				email: p.email,
				address: p.address,
				permanent_address: p.permanent_address,
				trainee_type_id: p.trainee_type_id,
				department_id: p.department_id,
				qualification: p.qualification,
				graduated_school: p.graduated_school,
				graduated_year: p.graduated_year,
				is_employee: p.is_employee,
				notes: p.notes,
			},
			actorId,
			{ fetch: false },
		);
		inserted += 1;
	}

	return { dry_run: false, inserted, warnings };
};

module.exports = { importExcel };
