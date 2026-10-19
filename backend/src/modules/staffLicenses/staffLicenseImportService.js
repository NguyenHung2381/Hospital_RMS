/**
 * staffLicenseImportService.js — Cập nhật hồ sơ CCHN hàng loạt từ file Excel
 * "Danh sách người hành nghề" (xuất từ phần mềm Sở Y tế). Khớp nhân sự theo
 * MNV ↔ users.staff_number; KHÔNG tạo tài khoản mới (MNV chưa có → bỏ qua, báo
 * lại). Chỉ ghi các cột có trong file; dry_run trả danh sách dòng mới/thay đổi.
 * Ngoài hồ sơ CCHN còn bổ sung ngày sinh / giới tính vào users (dùng cho bản
 * chụp người hướng dẫn thực hành trên Phiếu nhận xét).
 */
const { getPool, sql } = require('../../config/db');
const { broadcast } = require('../events/eventService');
const { norm, normDept } = require('../../utils/vietnameseText');
const { normalizeGender } = require('../../utils/gender');
const { readSheet, parseDateCell, parseDateText } = require('../../utils/excelImport');
const personService = require('../persons/personService');
const { fieldDefs } = require('./staffLicenseService');

// Cột "Nơi cấp khác Nghệ An" để trống nghĩa là cấp tại Nghệ An
const DEFAULT_AUTHORITY = 'Sở Y tế Nghệ An';

// Tiêu đề file thật (2.xlsx, 09/2026): TT | MNV | Mã nhân viên | CCCD | Họ và tên |
// K/P/TT đến T8.2026 | Văn bằng chuyên môn T8.2025 | Ngày tháng năm sinh |
// Phạm vi hành nghề NỐI cả QĐ bổ sung PV | Phạm vi hành nghề ĐƠN | Số CCHN |
// Nơi cấp khác Nghệ An | Ngày cấp chứng chỉ hành nghề | Quyết định bổ sung phạm vi |
// Điều chỉnh phạm vi HĐCM trong CCHN | Mã hoá phạm vi điều chỉnh theo 2148 (BHXH) |
// Ngày điều chỉnh phạm vi | Nơi cấp QĐ điều chỉnh
//  - Cột "Mã nhân viên" thực chất chứa SỐ CCHN: mỗi trường lấy cột khớp ĐẦU TIÊN,
//    "MNV" đứng trước nên staff_no đúng (test giữ hành vi này).
//  - CCCD cố ý không nhận: không mẫu giấy tờ nào cần CCCD của nhân sự.
const COLUMN_MATCHERS = [
	['staff_no', (h) => h === 'mnv' || h === 'ma nv' || h.includes('ma nhan vien')],
	['full_name', (h) => h === 'ho va ten' || h === 'ho ten'],
	['license_no', (h) => h === 'so cchn' || h.includes('so chung chi hanh nghe')],
	['issued_date', (h) => h.startsWith('ngay cap')],
	['issuing_authority', (h) => h === 'noi cap' || h.includes('co quan cap')],
	['issuing_authority_other', (h) => h.startsWith('noi cap khac')],
	// "…NỐI cả QĐ bổ sung PV" đã gộp phạm vi bổ sung → ưu tiên hơn cột "…ĐƠN"
	[
		'practice_scope',
		(h) =>
			h === 'pham vi hanh nghe' ||
			h === 'pham vi hoat dong chuyen mon' ||
			h.startsWith('pham vi hanh nghe noi'),
	],
	['practice_scope_single', (h) => h.startsWith('pham vi hanh nghe don')],
	['scope_code', (h) => h.startsWith('ma hoa pham vi')],
	['scope_decision_no', (h) => h.includes('quyet dinh bo sung')],
	['adjusted_scope', (h) => h.startsWith('dieu chinh pham vi')],
	['scope_adjusted_date', (h) => h.startsWith('ngay dieu chinh')],
	['cme_specialty', (h) => h.includes('cap nhat kien thuc')],
	['primary_specialty', (h) => h === 'chuyen khoa' || h === 'chuyen khoa chinh'],
	['qualification', (h) => h.includes('van bang')],
	['title', (h) => h === 'chuc danh'],
	['dob', (h) => h === 'ngay sinh' || h === 'ngay thang nam sinh'],
	['gender', (h) => h === 'gioi tinh'],
	// "K/P/TT đến T8.2026": chỉ để cảnh báo khi lệch khoa, không đổi khoa của nhân sự
	['department_hint', (h) => h.startsWith('k p tt') || h === 'khoa phong'],
];

const DATE_FIELDS = new Set(['issued_date', 'scope_adjusted_date']);
const typeOf = Object.fromEntries(fieldDefs);

// Cột của users ghi kèm: [cột DB, kiểu, trường trong file]
/** @type {Array<[string, any, string]>} */
const USER_FIELDS = [
	['date_of_birth', sql.Date, 'dob'],
	['gender', sql.VarChar(10), 'gender'],
];

// Ô lỗi công thức (file thật có #N/A ở cột khoa / ngày sinh) coi như ô trống
const EXCEL_ERROR = /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!)$/;

const toYmd = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? null));

// Cùng khoa khi mọi từ của tên ngắn đều có trong tên dài: file ghi tắt
// "Nội hô hấp" = "Khoa Nội Dị Ứng - Hô Hấp"; "Nội tim mạch 1" ≠ "… 2".
const sameDepartment = (a, b) => {
	const [x, y] = [normDept(a).split(' '), normDept(b).split(' ')].sort(
		(p, q) => p.length - q.length,
	);
	return x.every((w) => y.includes(w));
};

// Ô có nhiều ngày ("01/06/2020;15/03/2023" — phạm vi điều chỉnh nhiều lần) → ngày gần nhất.
const latestDate = (raw) => {
	const parts = raw.split(/[;,\n]+/).filter((p) => p.trim());
	if (parts.length < 2) return null;
	const dates = parts.map(parseDateText);
	return dates.every(Boolean) ? dates.sort().at(-1) : null;
};

const importExcel = async ({ buffer, dry_run }, actorId) => {
	const { cols, rows: sheetRows } = await readSheet(buffer, {
		matchers: COLUMN_MATCHERS,
		isValid: (c) => !!(c.staff_no && c.license_no),
		headerError: 'Không tìm thấy dòng tiêu đề (cần ít nhất cột "MNV" và "Số CCHN").',
		isEmpty: (get, row) => !get(row, 'staff_no') && !get(row, 'full_name'),
	});
	const fields = fieldDefs
		.map(([f]) => f)
		.filter(
			(f) =>
				cols[f] ||
				(f === 'issuing_authority' && cols.issuing_authority_other) ||
				(f === 'practice_scope' && cols.practice_scope_single),
		);
	const userFields = USER_FIELDS.filter(([, , src]) => cols[src]);

	const pool = await getPool();
	const existing = await pool.request().query(`
    SELECT u.id AS user_id, u.staff_number, u.full_name, d.name AS department_name,
           sl.id AS license_id
           ${fields.map((f) => `, sl.${f}`).join('')}
           ${userFields.map(([c]) => `, u.${c}`).join('')}
    FROM users u
    LEFT JOIN staff_practice_licenses sl ON sl.user_id = u.id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE u.staff_number IS NOT NULL
    ORDER BY u.is_active DESC`);
	const byNo = new Map();
	for (const u of existing.recordset) if (!byNo.has(u.staff_number)) byNo.set(u.staff_number, u);

	const skipped = [];
	const warnings = [];
	// Gộp theo MNV: file thật có người xuất hiện 2 dòng (1 dòng trống, 1 dòng có CCHN)
	const byStaff = new Map();
	for (const { r, row, get } of sheetRows) {
		const text = (f) => {
			const v = get(row, f);
			return EXCEL_ERROR.test(v) ? '' : v;
		};
		const staffRaw = text('staff_no');
		const fullName = text('full_name');
		const skip = (reason) =>
			skipped.push({ row: r, staff_no: staffRaw, full_name: fullName, reason });

		// MNV phải toàn số — "ĐHV3" không được hiểu thành MNV 3
		if (!/^\d+$/.test(staffRaw)) {
			skip(`MNV "${staffRaw}" không phải mã số nhân viên`);
			continue;
		}
		const staffNo = parseInt(staffRaw, 10);
		const user = byNo.get(staffNo);
		if (!user) {
			skip(`Chưa có nhân viên MNV ${staffRaw} trong hệ thống`);
			continue;
		}

		const rawOf = (f) => {
			if (f === 'practice_scope') return text('practice_scope') || text('practice_scope_single');
			if (f === 'issuing_authority' && !cols.issuing_authority) {
				// Chỉ điền mặc định cho dòng có số CCHN
				return text('issuing_authority_other') || (text('license_no') ? DEFAULT_AUTHORITY : '');
			}
			return text(f);
		};

		// Ô trống KHÔNG xoá dữ liệu cũ — muốn xoá thì sửa tay trên giao diện
		const values = {};
		const userValues = {};
		const rowWarnings = [];
		for (const f of fields) {
			const raw = rawOf(f);
			if (!raw) continue;
			if (DATE_FIELDS.has(f)) {
				const d = parseDateCell(row.getCell(cols[f])) ?? latestDate(raw);
				if (d) values[f] = d;
				else rowWarnings.push(`Ngày "${raw}" không hợp lệ — giữ nguyên dữ liệu cũ`);
			} else {
				values[f] = raw;
			}
		}
		const dobRaw = cols.dob ? text('dob') : '';
		if (dobRaw) {
			const d = parseDateCell(row.getCell(cols.dob));
			if (d) userValues.date_of_birth = d;
			else rowWarnings.push(`Ngày sinh "${dobRaw}" không hợp lệ — giữ nguyên dữ liệu cũ`);
		}
		const genderRaw = cols.gender ? text('gender') : '';
		if (genderRaw) {
			const g = normalizeGender(genderRaw);
			if (g) userValues.gender = g;
			else rowWarnings.push(`Giới tính "${genderRaw}" không nhận diện được — bỏ qua`);
		}
		const deptRaw = cols.department_hint ? text('department_hint') : '';
		if (deptRaw && !(user.department_name && sameDepartment(deptRaw, user.department_name))) {
			rowWarnings.push(
				user.department_name
					? `Khoa trong file "${deptRaw}" khác khoa trong hệ thống "${user.department_name}" — không đổi khoa`
					: `Nhân sự chưa có khoa trong hệ thống (file ghi "${deptRaw}")`,
			);
		}

		const prev = byStaff.get(staffNo);
		if (prev) {
			Object.assign(prev.values, values);
			Object.assign(prev.userValues, userValues);
			prev.warnings.push(`Trùng MNV với dòng ${r} — đã gộp 2 dòng`, ...rowWarnings);
			continue;
		}
		if (fullName && norm(fullName) !== norm(user.full_name)) {
			rowWarnings.push(`Tên trong file "${fullName}" khác tên trong hệ thống "${user.full_name}"`);
		}
		byStaff.set(staffNo, {
			row: r,
			staffNo,
			fullName,
			user,
			values,
			userValues,
			warnings: rowWarnings,
		});
	}

	const items = [];
	const seenLicense = new Map();
	let unchanged = 0;
	for (const entry of byStaff.values()) {
		const { row, staffNo, fullName, user, values, userValues, warnings: rowWarnings } = entry;
		if (values.license_no) {
			const dupRow = seenLicense.get(values.license_no);
			if (dupRow) {
				skipped.push({
					row,
					staff_no: String(staffNo),
					full_name: fullName,
					reason: `Số CCHN ${values.license_no} trùng với dòng ${dupRow}`,
				});
				continue;
			}
			seenLicense.set(values.license_no, row);
		}
		const diff = (obj) =>
			Object.keys(obj)
				.filter((f) => toYmd(user[f]) !== obj[f])
				.map((f) => ({ field: f, old: toYmd(user[f]), new: obj[f] }));
		const changes = [...diff(values), ...diff(userValues)];
		if (!changes.length) {
			if (user.license_id) unchanged += 1;
			continue;
		}
		for (const w of rowWarnings) warnings.push(`Dòng ${row} (MNV ${staffNo}): ${w}`);
		items.push({
			row,
			staff_number: staffNo,
			user_id: user.user_id,
			full_name: user.full_name,
			license_id: user.license_id,
			// "new" = tạo hồ sơ CCHN mới; dòng chỉ bổ sung ngày sinh/giới tính tính là "changed"
			status: user.license_id || !Object.keys(values).length ? 'changed' : 'new',
			values,
			user_values: userValues,
			changes,
			warnings: rowWarnings,
		});
	}

	const summary = {
		total: sheetRows.length,
		new: items.filter((i) => i.status === 'new').length,
		changed: items.filter((i) => i.status === 'changed').length,
		unchanged,
		skipped: skipped.length,
	};
	const columns = [...fields, ...userFields.map(([c]) => c)];
	if (dry_run) return { dry_run: true, summary, rows: items, skipped, warnings, columns };

	let written = 0;
	const touchedUsers = [];
	for (const it of items) {
		let ok = false;
		const keys = Object.keys(it.values);
		if (keys.length) {
			const req = pool
				.request()
				.input('actor_id', sql.VarChar(20), actorId)
				.input('user_id', sql.VarChar(20), it.user_id);
			for (const f of keys) req.input(f, typeOf[f], it.values[f]);
			const query = it.license_id
				? `UPDATE staff_practice_licenses SET ${keys.map((f) => `${f} = @${f}`).join(', ')},
				     updated_at = GETDATE(), updated_by = @actor_id WHERE user_id = @user_id`
				: `INSERT INTO staff_practice_licenses (id, user_id, ${keys.join(', ')}, created_by)
				   VALUES ('LIC' + LEFT(REPLACE(NEWID(),'-',''), 17), @user_id, ${keys.map((f) => `@${f}`).join(', ')}, @actor_id)`;
			try {
				await req.query(`EXEC sp_set_actor @actor_id; ${query}`);
				ok = true;
			} catch (err) {
				// 2601/2627: số CCHN đã thuộc nhân sự khác (UQ_stafflic_license_no)
				if (err.number !== 2601 && err.number !== 2627) throw err;
				warnings.push(
					`Dòng ${it.row} (MNV ${it.staff_number}): số CCHN ${it.values.license_no} đã gán cho nhân sự khác — bỏ qua`,
				);
			}
		}
		const userKeys = userFields.map(([c]) => c).filter((c) => it.user_values[c] !== undefined);
		if (userKeys.length) {
			const req = pool
				.request()
				.input('actor_id', sql.VarChar(20), actorId)
				.input('user_id', sql.VarChar(20), it.user_id);
			for (const [c, type] of userFields)
				if (userKeys.includes(c)) req.input(c, type, it.user_values[c]);
			await req.query(`EXEC sp_set_actor @actor_id;
			  UPDATE users SET ${userKeys.map((c) => `${c} = @${c}`).join(', ')},
			    updated_at = GETDATE(), updated_by = @actor_id WHERE id = @user_id`);
			touchedUsers.push(it.user_id);
			ok = true;
		}
		if (ok) written += 1;
	}
	// Ngày sinh / giới tính của users là nguồn cho persons — đồng bộ lại
	if (touchedUsers.length) await personService.syncPersons('users', touchedUsers, { actorId });
	if (written) broadcast('update', { entity: 'staff_license' });
	return { dry_run: false, summary, written, skipped, warnings };
};

module.exports = { importExcel, COLUMN_MATCHERS };
