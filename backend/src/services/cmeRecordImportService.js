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
const { ROLE, inputRoleId } = require('./roleCodes');
const xl = require('../utils/excelTemplate');

// Cột file mẫu / file xuất — header khớp COLUMN_MATCHERS nên file xuất nhập lại được.
// Khoa/phòng, Minh chứng chỉ để xem, khi nhập bị bỏ qua.
const SHEET_COLUMNS = [
	{ key: 'stt', header: 'STT', width: 6 },
	{ key: 'staff_number', header: 'Mã NV', width: 9 },
	{ key: 'full_name', header: 'Họ tên', width: 26 },
	{ key: 'department', header: 'Khoa/Phòng', width: 26 },
	{ key: 'year', header: 'Năm', width: 8 },
	{ key: 'group', header: 'Nhóm hình thức', width: 40 },
	{ key: 'category', header: 'Loại hình thức', width: 38 },
	{ key: 'title', header: 'Hoạt động', width: 34 },
	{ key: 'role', header: 'Vai trò', width: 14 },
	{ key: 'quantity', header: 'Số lượng', width: 10 },
	{ key: 'credits', header: 'Giờ tín chỉ', width: 12 },
	{ key: 'activity_date', header: 'Từ ngày', width: 13 },
	{ key: 'end_date', header: 'Đến ngày', width: 13 },
	{ key: 'evidence', header: 'Minh chứng', width: 28 },
	{ key: 'notes', header: 'Ghi chú', width: 26 },
];

const fmtDate = (d) => {
	if (!d) return '';
	const x = d instanceof Date ? d : new Date(d);
	if (Number.isNaN(x.getTime())) return '';
	return `${pad2(x.getUTCDate())}/${pad2(x.getUTCMonth() + 1)}/${x.getUTCFullYear()}`;
};

const buildSheet = (wb, title, subtitle) =>
	xl.buildSheet(wb, { sheetName: 'Ghi nhận CME', title, subtitle, columns: SHEET_COLUMNS, letterhead: true });

// Dropdown "Danh mục quy đổi" lấy từ sheet ẩn (danh sách dài, vượt giới hạn 255 ký tự)
const applyCategoryDropdown = async (wb, ws) => {
	const pool = await getPool();
	const r = await pool.request().query('SELECT name FROM cme_credit_categories ORDER BY name');
	const range = xl.addLookupSheet(wb, 'DS_DanhMuc', 'Danh mục quy đổi (tự sinh — không sửa)', r.recordset.map((c) => c.name));
	xl.addDropdowns(ws, SHEET_COLUMNS, { category: range && { range } });
};

const templateWorkbook = async () => {
	const wb = new ExcelJS.Workbook();
	const ws = buildSheet(
		wb,
		'MẪU NHẬP GHI NHẬN CME ĐỘC LẬP',
		'Bắt buộc: MNV hoặc Họ và tên (ưu tiên MNV), Năm hoặc Từ ngày (dd/mm/yyyy), Số tín chỉ. Danh mục: chọn từ danh sách, để trống nếu không thuộc danh mục. Cột Khoa/Phòng, Minh chứng không cần điền; Nhóm hình thức chỉ cần khi Loại hình thức bị trùng tên (vd "Khác"). Xoá dòng ví dụ trước khi nhập.',
	);
	ws.getRow(5).height = 30;
	ws.addRow({
		stt: 1,
		staff_number: 1234,
		full_name: 'Nguyễn Văn A',
		title: 'Tự học chuyên đề X (ví dụ)',
		role: 'Đại biểu',
		quantity: 1,
		year: 2026,
		activity_date: '15/10/2026',
		credits: 2,
	});
	xl.styleBody(ws);
	ws.getRow(ws.headRow + 1).font = { italic: true, color: { argb: 'FF6B7280' } };
	await applyCategoryDropdown(wb, ws);
	return wb;
};

const NO_CATEGORY = '__none__';

// filters khớp bộ lọc trang danh sách: year, search, department, category_id (NO_CATEGORY = không thuộc danh mục), evidence ('yes'|'no')
const exportWorkbook = async ({ year, search, department, category_id, evidence } = {}) => {
	const { data } = await cmeRecordService.getAll({ year, limit: 0 });
	const q = String(search || '').trim().toLowerCase();
	const rows = data.filter((r) => {
		if (q && !r.user_name.toLowerCase().includes(q) && !r.title.toLowerCase().includes(q)) return false;
		if (department && r.department_name !== department) return false;
		if (category_id === NO_CATEGORY && r.category_id) return false;
		if (category_id && category_id !== NO_CATEGORY && r.category_id !== category_id) return false;
		if (evidence === 'yes' && !r.evidence_file_url) return false;
		if (evidence === 'no' && r.evidence_file_url) return false;
		return true;
	});

	const wb = new ExcelJS.Workbook();
	const total = rows.reduce((s, r) => s + Number(r.credits || 0), 0);
	const subtitle = [
		year ? `Năm ${year}` : 'Tất cả các năm',
		`Xuất ngày ${fmtDate(new Date())}`,
		`${rows.length} bản ghi · ${total.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tín chỉ`,
	].join(' · ');
	const ws = buildSheet(wb, year ? `SỔ THEO DÕI TÍN CHỈ CME năm ${year}` : 'SỔ THEO DÕI TÍN CHỈ CME', subtitle);
	rows.forEach((r, i) => {
		ws.addRow({
			stt: i + 1,
			staff_number: r.staff_number ?? '',
			full_name: r.user_name,
			department: r.department_name ?? '',
			group: r.group_name ?? '',
			category: r.category_name ?? '',
			title: r.title,
			role: r.role ?? '',
			quantity: r.quantity ?? '',
			year: r.year,
			activity_date: fmtDate(r.activity_date),
			end_date: fmtDate(r.end_date),
			credits: Number(r.credits),
			notes: r.note ?? '',
			evidence: r.evidence_file_name ?? '',
		});
	});
	xl.styleBody(ws);
	await applyCategoryDropdown(wb, ws);
	return wb;
};

const COLUMN_MATCHERS = [
	['stt', (h) => h === 'stt' || h === 'tt'],
	['staff_number', (h) => h === 'mnv' || h === 'ma nv' || h.includes('ma nhan vien')],
	['full_name', (h) => h === 'ho va ten' || h === 'ho ten'],
	['year', (h) => h === 'nam'],
	['group_raw', (h) => h === 'nhom hinh thuc'],
	['category_raw', (h) => h.includes('danh muc') || h === 'loai hinh' || h === 'hinh thuc' || h === 'loai hinh thuc'],
	['title', (h) => h.includes('noi dung') || h === 'ten hoat dong' || h === 'hoat dong' || h === 'mo ta'],
	['role', (h) => h === 'vai tro'],
	['quantity', (h) => h === 'so luong'],
	['activity_date', (h) => h.includes('ngay hoat dong') || h === 'ngay' || h === 'tu ngay' || h.includes('ngay thuc hien')],
	['end_date', (h) => h === 'den ngay'],
	['credits', (h) => h.includes('so tin chi') || h === 'gio tin chi' || h === 'tin chi' || h === 'tc'],
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
	const maxRow = ws.rowCount || headerRow;
	for (let r = headerRow + 1; r <= maxRow && emptyStreak < 25; r++) {
		const row = ws.getRow(r);
		const fullName = get(row, 'full_name');
		const staffNumber = parseStaffNumber(get(row, 'staff_number'));
		if (!fullName && !staffNumber) {
			emptyStreak++;
			continue;
		}
		emptyStreak = 0;
		// Bỏ dòng ví dụ trong file mẫu nếu người dùng quên xoá
		if (/\(ví dụ\)\s*$/i.test(get(row, 'title'))) continue;
		rows.push({
			row: r,
			full_name: fullName,
			staff_number: staffNumber,
			category_raw: get(row, 'category_raw') || null,
			group_raw: get(row, 'group_raw') || null,
			year: parseInt(get(row, 'year'), 10) || null,
			role: get(row, 'role') || null,
			quantity: parseCredits(get(row, 'quantity')),
			end_date: parseDate(cols.end_date ? row.getCell(cols.end_date) : null),
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
		// Loại tài khoản khoa dùng chung (vai trò dept_head) — không phải một người
		(await inputRoleId(pool.request(), 'dept_head_role', ROLE.DEPT_HEAD)).query(
			'SELECT id, full_name, staff_number FROM users WHERE is_active = 1 AND role_id <> @dept_head_role',
		),
		pool.request().query(
			'SELECT c.id, c.name, g.name AS group_name FROM cme_credit_categories c LEFT JOIN cme_credit_groups g ON g.id = c.group_id',
		),
	]);
	const byStaff = new Map();
	const byName = new Map();
	for (const u of users.recordset) {
		if (u.staff_number != null) byStaff.set(Number(u.staff_number), u);
		const key = norm(stripQualification(u.full_name));
		if (!byName.has(key)) byName.set(key, []);
		byName.get(key).push(u);
	}
	// Tên danh mục có thể trùng giữa các nhóm (vd "Khác (nhập số tín chỉ trực tiếp)") → giữ danh sách id
	const categoryByName = new Map();
	const categoryByGroup = new Map();
	for (const c of categories.recordset) {
		const k = norm(c.name);
		if (!categoryByName.has(k)) categoryByName.set(k, []);
		categoryByName.get(k).push(c.id);
		categoryByGroup.set(`${norm(c.group_name || '')}|${k}`, c.id);
	}
	return { byStaff, byName, categoryByName, categoryByGroup };
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
		let categoryId = null;
		if (row.category_raw) {
			const k = norm(row.category_raw);
			const byGroup = row.group_raw && lookups.categoryByGroup.get(`${norm(row.group_raw)}|${k}`);
			const ids = lookups.categoryByName.get(k) || [];
			categoryId = byGroup || (ids.length === 1 ? ids[0] : null);
			if (!categoryId) warnings.push(`Không khớp danh mục "${row.category_raw}" — để trống.`);
		}
		// Có cột Năm thì không bắt buộc ngày; không có thì suy ra năm từ ngày hoạt động
		const year = row.year || (row.activity_date ? +row.activity_date.slice(0, 4) : null);
		if (!year) warnings.push('Thiếu Năm và Ngày hoạt động — bỏ qua dòng này khi nhập.');
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
			end_date: row.end_date,
			year,
			role: row.role,
			quantity: row.quantity,
			credits: row.credits,
			notes: row.notes,
			warnings,
			valid: !!user && !!year && row.credits != null,
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
						end_date: p.end_date,
						year: p.year,
						role: p.role,
						quantity: p.quantity,
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

module.exports = { importExcel, templateWorkbook, exportWorkbook };
