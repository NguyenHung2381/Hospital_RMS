/**
 * cmeRecordImportService.js — Nhập ghi nhận CME độc lập hàng loạt từ Excel.
 * Mirror seminarImportService/traineeImportService (dò tiêu đề, khớp cột gần
 * đúng, dry_run trả preview). Khớp nhân viên theo MNV hoặc họ tên, khớp danh
 * mục quy đổi theo tên — không đính kèm minh chứng qua import (thêm sau ở
 * từng dòng nếu cần, qua addEvidence).
 */
const ExcelJS = require('exceljs');
const { getPool } = require('../config/db');
const { norm, stripQualification } = require('../utils/vietnameseText');
const cmeRecordService = require('./cmeRecordService');

const COLUMN_MATCHERS = [
	['stt', (h) => h === 'stt' || h === 'tt'],
	['staff_number', (h) => h === 'mnv' || h === 'ma nv' || h.includes('ma nhan vien')],
	['full_name', (h) => h === 'ho va ten' || h === 'ho ten'],
	['category_raw', (h) => h.includes('danh muc') || h === 'loai hinh' || h === 'hinh thuc'],
	['title', (h) => h.includes('noi dung') || h === 'ten hoat dong' || h === 'mo ta'],
	['activity_date', (h) => h.includes('ngay hoat dong') || h === 'ngay' || h.includes('ngay thuc hien')],
	['credits', (h) => h.includes('so tin chi') || h === 'tin chi' || h === 'tc'],
	['notes', (h) => h === 'ghi chu'],
];

const cellText = (cell) => {
	if (!cell) return '';
	try {
		return String(cell.text ?? '').replace(/\s+/g, ' ').trim();
	} catch {
		return '';
	}
};

const pad2 = (n) => String(n).padStart(2, '0');

const parseDate = (cell) => {
	if (!cell) return null;
	const v = cell.value;
	if (v instanceof Date && !Number.isNaN(v.getTime())) {
		return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())}`;
	}
	const raw = cellText(cell).trim();
	const m = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
	if (m) {
		const d = +m[1];
		const mo = +m[2];
		const y = +m[3];
		if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return `${y}-${pad2(mo)}-${pad2(d)}`;
	}
	return null;
};

const parseCredits = (s) => {
	const t = String(s || '').replace(',', '.').trim();
	if (!t) return null;
	const n = parseFloat(t);
	return Number.isFinite(n) ? n : null;
};

const parseStaffNumber = (s) => {
	const t = String(s || '').replace(/\D+/g, '');
	if (!t) return null;
	const n = parseInt(t, 10);
	return Number.isFinite(n) ? n : null;
};

const findHeader = (workbook) => {
	for (const ws of workbook.worksheets) {
		const scanMax = Math.min(ws.actualRowCount || ws.rowCount || 0, 30);
		for (let r = 1; r <= scanMax; r++) {
			const row = ws.getRow(r);
			const cols = {};
			row.eachCell({ includeEmpty: false }, (cell, col) => {
				const h = norm(cellText(cell));
				if (!h) return;
				for (const [field, test] of COLUMN_MATCHERS) {
					if (cols[field] == null && test(h)) {
						cols[field] = col;
						break;
					}
				}
			});
			if (cols.full_name || cols.staff_number) return { ws, headerRow: r, cols };
		}
	}
	return null;
};

const parseWorkbook = async (buffer) => {
	const workbook = new ExcelJS.Workbook();
	try {
		await workbook.xlsx.load(buffer);
	} catch {
		throw Object.assign(new Error('File không đọc được — cần file .xlsx hợp lệ.'), { statusCode: 400 });
	}
	const header = findHeader(workbook);
	if (!header) {
		throw Object.assign(
			new Error(
				'Không tìm thấy dòng tiêu đề (cần cột "MNV" hoặc "Họ và tên"; các cột nhận diện: Danh mục, Nội dung, Ngày hoạt động, Số tín chỉ, Ghi chú).',
			),
			{ statusCode: 400 },
		);
	}
	const { ws, headerRow, cols } = header;
	const get = (row, field) => (cols[field] ? cellText(row.getCell(cols[field])) : '');

	const rows = [];
	let emptyStreak = 0;
	const maxRow = ws.actualRowCount || ws.rowCount || headerRow;
	for (let r = headerRow + 1; r <= maxRow && emptyStreak < 25; r++) {
		const row = ws.getRow(r);
		const fullName = get(row, 'full_name');
		const staffNumber = parseStaffNumber(get(row, 'staff_number'));
		if (!fullName && !staffNumber) {
			emptyStreak++;
			continue;
		}
		emptyStreak = 0;
		rows.push({
			row: r,
			full_name: fullName,
			staff_number: staffNumber,
			category_raw: get(row, 'category_raw') || null,
			title: get(row, 'title') || 'Hoạt động CME',
			activity_date: parseDate(cols.activity_date ? row.getCell(cols.activity_date) : null),
			credits: parseCredits(get(row, 'credits')),
			notes: get(row, 'notes') || null,
		});
	}
	if (!rows.length) {
		throw Object.assign(new Error('File không có dòng dữ liệu nào.'), { statusCode: 400 });
	}
	return { rows };
};

const loadLookups = async () => {
	const pool = await getPool();
	const [users, categories] = await Promise.all([
		pool.request().query("SELECT id, full_name, staff_number FROM users WHERE is_active = 1 AND role_id <> 'VT07'"),
		pool.request().query('SELECT id, name FROM cme_credit_categories'),
	]);
	const byStaff = new Map();
	const byName = new Map();
	for (const u of users.recordset) {
		if (u.staff_number != null) byStaff.set(Number(u.staff_number), u);
		const key = norm(stripQualification(u.full_name));
		if (!byName.has(key)) byName.set(key, []);
		byName.get(key).push(u);
	}
	const categoryByName = new Map(categories.recordset.map((c) => [norm(c.name), c.id]));
	return { byStaff, byName, categoryByName };
};

const matchUser = (row, lookups) => {
	if (row.staff_number != null && lookups.byStaff.has(row.staff_number)) {
		return lookups.byStaff.get(row.staff_number);
	}
	const cands = lookups.byName.get(norm(stripQualification(row.full_name || ''))) || [];
	return cands.length === 1 ? cands[0] : null;
};

const buildPreview = (rows, lookups) => {
	return rows.map((row) => {
		const warnings = [];
		const user = matchUser(row, lookups);
		if (!user) warnings.push('Không khớp được nhân viên — bỏ qua dòng này khi nhập.');
		const categoryId = row.category_raw ? lookups.categoryByName.get(norm(row.category_raw)) : null;
		if (row.category_raw && !categoryId) warnings.push(`Không khớp danh mục "${row.category_raw}" — để trống.`);
		if (!row.activity_date) warnings.push('Ngày hoạt động không hợp lệ hoặc để trống — bỏ qua dòng này khi nhập.');
		if (row.credits == null) warnings.push('Số tín chỉ không hợp lệ — bỏ qua dòng này khi nhập.');

		return {
			row: row.row,
			user_id: user?.id || null,
			matched_user_name: user?.full_name || null,
			full_name_raw: row.full_name,
			staff_number: row.staff_number,
			category_id: categoryId || null,
			category_raw: row.category_raw,
			title: row.title,
			activity_date: row.activity_date,
			credits: row.credits,
			notes: row.notes,
			warnings,
			valid: !!user && !!row.activity_date && row.credits != null,
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
			warnings.push(`Dòng ${p.row} (${p.matched_user_name || p.full_name_raw || p.staff_number}): ${w}`);
		}
	}

	const summary = {
		total: preview.length,
		matched: preview.filter((p) => p.user_id).length,
		valid: preview.filter((p) => p.valid).length,
	};

	if (dry_run) {
		return { dry_run: true, rows: preview, summary, warnings };
	}

	// Id sinh bằng NEWID() nên chèn song song an toàn — chạy theo lô CONCURRENCY
	// dòng thay vì tuần tự từng dòng (pool DB tối đa 10 kết nối).
	const CONCURRENCY = 5;
	const valid = preview.filter((p) => p.valid);
	let inserted = 0;
	for (let i = 0; i < valid.length; i += CONCURRENCY) {
		await Promise.all(
			valid.slice(i, i + CONCURRENCY).map((p) =>
				cmeRecordService.create(
					{
						user_id: p.user_id,
						category_id: p.category_id,
						title: p.title,
						activity_date: p.activity_date,
						credits: p.credits,
						note: p.notes,
					},
					actorId,
					{ fetch: false },
				),
			),
		);
		inserted += Math.min(CONCURRENCY, valid.length - i);
	}

	return { dry_run: false, inserted, warnings };
};

module.exports = { importExcel };
