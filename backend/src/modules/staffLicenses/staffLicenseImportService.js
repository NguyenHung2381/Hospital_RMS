/**
 * staffLicenseImportService.js — Cập nhật hồ sơ CCHN hàng loạt từ file Excel
 * "Danh sách người hành nghề" (xuất từ phần mềm Sở Y tế). Khớp nhân sự theo
 * MNV ↔ users.staff_number; KHÔNG tạo tài khoản mới (MNV chưa có → bỏ qua, báo
 * lại). Chỉ ghi các cột có trong file; dry_run trả danh sách dòng mới/thay đổi.
 */
const { getPool, sql } = require('../../config/db');
const { broadcast } = require('../events/eventService');
const { norm } = require('../../utils/vietnameseText');
const { readSheet, parseDateCell } = require('../../utils/excelImport');
const { fieldDefs } = require('./staffLicenseService');

const COLUMN_MATCHERS = [
	['staff_no', (h) => h === 'mnv' || h === 'ma nv' || h.includes('ma nhan vien')],
	['full_name', (h) => h === 'ho va ten' || h === 'ho ten'],
	['license_no', (h) => h === 'so cchn' || h.includes('so chung chi hanh nghe')],
	['issued_date', (h) => h.startsWith('ngay cap')],
	['issuing_authority', (h) => h === 'noi cap' || h.includes('co quan cap')],
	['practice_scope', (h) => h === 'pham vi hanh nghe' || h === 'pham vi hoat dong chuyen mon'],
	['scope_decision_no', (h) => h.includes('quyet dinh bo sung')],
	['adjusted_scope', (h) => h.startsWith('dieu chinh pham vi')],
	['scope_adjusted_date', (h) => h.startsWith('ngay dieu chinh')],
	['cme_specialty', (h) => h.includes('cap nhat kien thuc')],
	['primary_specialty', (h) => h === 'chuyen khoa' || h === 'chuyen khoa chinh'],
	['qualification', (h) => h.includes('van bang')],
	['title', (h) => h === 'chuc danh'],
];

const DATE_FIELDS = new Set(['issued_date', 'scope_adjusted_date']);
const typeOf = Object.fromEntries(fieldDefs);

const toYmd = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ?? null);

const importExcel = async ({ buffer, dry_run }, actorId) => {
	const { cols, rows: sheetRows } = await readSheet(buffer, {
		matchers: COLUMN_MATCHERS,
		isValid: (c) => !!(c.staff_no && c.license_no),
		headerError: 'Không tìm thấy dòng tiêu đề (cần ít nhất cột "MNV" và "Số CCHN").',
		isEmpty: (get, row) => !get(row, 'staff_no') && !get(row, 'full_name'),
	});
	const fields = fieldDefs.map(([f]) => f).filter((f) => cols[f]);

	const pool = await getPool();
	const existing = await pool.request().query(`
    SELECT u.id AS user_id, u.staff_number, u.full_name, sl.id AS license_id,
           ${fields.map((f) => `sl.${f}`).join(', ')}
    FROM users u LEFT JOIN staff_practice_licenses sl ON sl.user_id = u.id
    WHERE u.staff_number IS NOT NULL
    ORDER BY u.is_active DESC`);
	const byNo = new Map();
	for (const u of existing.recordset) if (!byNo.has(u.staff_number)) byNo.set(u.staff_number, u);

	const skipped = [];
	const warnings = [];
	// Gộp theo MNV: file thật có người xuất hiện 2 dòng (1 dòng trống, 1 dòng có CCHN)
	const byStaff = new Map();
	for (const { r, row, get } of sheetRows) {
		const staffRaw = get(row, 'staff_no');
		const fullName = get(row, 'full_name');
		const skip = (reason) => skipped.push({ row: r, staff_no: staffRaw, full_name: fullName, reason });

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

		// Ô trống KHÔNG xoá dữ liệu cũ — muốn xoá thì sửa tay trên giao diện
		const values = {};
		const rowWarnings = [];
		for (const f of fields) {
			const raw = get(row, f);
			if (!raw) continue;
			if (DATE_FIELDS.has(f)) {
				const d = parseDateCell(row.getCell(cols[f]));
				if (d) values[f] = d;
				else rowWarnings.push(`Ngày "${raw}" không hợp lệ — giữ nguyên dữ liệu cũ`);
			} else {
				values[f] = raw;
			}
		}

		const prev = byStaff.get(staffNo);
		if (prev) {
			Object.assign(prev.values, values);
			prev.warnings.push(`Trùng MNV với dòng ${r} — đã gộp 2 dòng`, ...rowWarnings);
			continue;
		}
		if (fullName && norm(fullName) !== norm(user.full_name)) {
			rowWarnings.push(`Tên trong file "${fullName}" khác tên trong hệ thống "${user.full_name}"`);
		}
		byStaff.set(staffNo, { row: r, staffNo, fullName, user, values, warnings: rowWarnings });
	}

	const items = [];
	const seenLicense = new Map();
	let unchanged = 0;
	for (const { row, staffNo, fullName, user, values, warnings: rowWarnings } of byStaff.values()) {
		if (values.license_no) {
			const dupRow = seenLicense.get(values.license_no);
			if (dupRow) {
				skipped.push({ row, staff_no: String(staffNo), full_name: fullName, reason: `Số CCHN ${values.license_no} trùng với dòng ${dupRow}` });
				continue;
			}
			seenLicense.set(values.license_no, row);
		}
		const changes = Object.keys(values)
			.filter((f) => toYmd(user[f]) !== values[f])
			.map((f) => ({ field: f, old: toYmd(user[f]), new: values[f] }));
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
			status: user.license_id ? 'changed' : 'new',
			values,
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
	if (dry_run) return { dry_run: true, summary, rows: items, skipped, warnings, columns: fields };

	let written = 0;
	for (const it of items) {
		const req = pool
			.request()
			.input('actor_id', sql.VarChar(20), actorId)
			.input('user_id', sql.VarChar(20), it.user_id);
		const keys = Object.keys(it.values);
		for (const f of keys) req.input(f, typeOf[f], it.values[f]);
		const query = it.license_id
			? `UPDATE staff_practice_licenses SET ${keys.map((f) => `${f} = @${f}`).join(', ')},
			     updated_at = GETDATE(), updated_by = @actor_id WHERE user_id = @user_id`
			: `INSERT INTO staff_practice_licenses (id, user_id, ${keys.join(', ')}, created_by)
			   VALUES ('LIC' + LEFT(REPLACE(NEWID(),'-',''), 17), @user_id, ${keys.map((f) => `@${f}`).join(', ')}, @actor_id)`;
		try {
			await req.query(`EXEC sp_set_actor @actor_id; ${query}`);
			written += 1;
		} catch (err) {
			// 2601/2627: số CCHN đã thuộc nhân sự khác (UQ_stafflic_license_no)
			if (err.number !== 2601 && err.number !== 2627) throw err;
			warnings.push(`Dòng ${it.row} (MNV ${it.staff_number}): số CCHN ${it.values.license_no} đã gán cho nhân sự khác — bỏ qua`);
		}
	}
	if (written) broadcast('update', { entity: 'staff_license' });
	return { dry_run: false, summary, written, skipped, warnings };
};

module.exports = { importExcel };
