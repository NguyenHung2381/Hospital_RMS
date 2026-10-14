/**
 * cmeRecordImportService.js — Nhập ghi nhận CME độc lập hàng loạt từ Excel.
 * Mirror seminarImportService/traineeImportService (dò tiêu đề, khớp cột gần
 * đúng, dry_run trả preview). Khớp nhân viên theo MNV hoặc họ tên, khớp danh
 * mục quy đổi theo tên — không đính kèm minh chứng qua import (thêm sau ở
 * từng dòng nếu cần, qua addEvidence).
 */
const { getPool } = require('../config/db');
const { norm, stripQualification } = require('../utils/vietnameseText');
const ExcelJS = require('exceljs');
const { parseDateCell, parseCredits, parseStaffNumber, readSheet } = require('../utils/excelImport');
const cmeRecordService = require('./cmeRecordService');
const { ROLE, inputRoleId } = require('./roleCodes');
const xl = require('../utils/excelTemplate');

// Cột file mẫu nhập — header khớp COLUMN_MATCHERS. Nhân viên khớp theo Mã NV
// (file cũ còn cột Họ tên vẫn nhập được). Minh chứng chỉ để xem, khi nhập bị bỏ qua.
const SHEET_COLUMNS = [
	{ key: 'stt', header: 'STT', width: 6 },
	{ key: 'staff_number', header: 'Mã NV', width: 9 },
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

const colOf = (key) => `$${xl.colLetter(SHEET_COLUMNS.findIndex((c) => c.key === key) + 1)}`;

const buildSheet = (wb, title, subtitle) =>
	xl.buildSheet(wb, { sheetName: 'Ghi nhận CME', title, subtitle, columns: SHEET_COLUMNS, letterhead: true });

// Dropdown Nhóm / Loại hình thức lấy từ sheet ẩn (danh sách dài, vượt giới hạn 255 ký tự).
// Loại lọc theo Nhóm cùng dòng: sheet DS_DanhMuc cột A=nhóm, B=loại (xếp theo nhóm cho liền
// khối → OFFSET/MATCH/COUNTIF cắt đúng khối); Nhóm trống → cột C = mọi loại.
// Cột D = giờ quy đổi của loại → cột Giờ tín chỉ có sẵn công thức = giờ quy đổi × Số lượng
// (gõ đè số khác vẫn được; loại "Khác" quy đổi 0 → để trống, nhập tay).
const applyCategoryDropdown = async (wb, ws) => {
	const pool = await getPool();
	const [groups, cats, all] = await Promise.all([
		pool.request().query('SELECT name FROM cme_credit_groups ORDER BY name'),
		pool
			.request()
			.query(
				'SELECT g.name AS group_name, c.name, c.conversion_value FROM cme_credit_categories c JOIN cme_credit_groups g ON g.id = c.group_id ORDER BY g.name, c.name',
			),
		pool.request().query('SELECT DISTINCT name FROM cme_credit_categories ORDER BY name'),
	]);
	const groupRange = xl.addLookupSheet(wb, 'DS_Nhom', 'Nhóm hình thức (tự sinh — không sửa)', groups.recordset.map((g) => g.name));
	const allCats = all.recordset;

	let catFormula = null;
	if (allCats.length) {
		const lk = wb.addWorksheet('DS_DanhMuc', { state: 'hidden' });
		lk.getRow(1).values = ['Nhóm (tự sinh — không sửa)', 'Loại hình thức', 'Tất cả loại', 'Giờ quy đổi'];
		cats.recordset.forEach((c, i) => {
			lk.getCell(i + 2, 1).value = c.group_name;
			lk.getCell(i + 2, 2).value = c.name;
			lk.getCell(i + 2, 4).value = Number(c.conversion_value) || 0;
		});
		allCats.forEach((c, i) => {
			lk.getCell(i + 2, 3).value = c.name;
		});
		const s = "'DS_DanhMuc'!";
		// Công thức tương đối theo ô đầu vùng validation (dòng đầu dữ liệu)
		const g = `${colOf('group')}${ws.headRow + 1}`;
		catFormula =
			`IF(${g}="",${s}$C$2:$C$${allCats.length + 1},` +
			`OFFSET(${s}$B$1,MATCH(${g},${s}$A:$A,0)-1,0,COUNTIF(${s}$A:$A,${g}),1))`;

		const toRow = Math.max(ws.rowCount, ws.headRow + 1) + 1000;
		const creditCol = SHEET_COLUMNS.findIndex((c) => c.key === 'credits') + 1;
		for (let r = ws.headRow + 1; r <= toRow; r++) {
			const cell = ws.getCell(r, creditCol);
			if (cell.value != null) continue;
			const [gr, ca, qty] = [`${colOf('group')}${r}`, `${colOf('category')}${r}`, `${colOf('quantity')}${r}`];
			const v =
				`IF(${gr}="",IFERROR(INDEX(${s}$D:$D,MATCH(${ca},${s}$B:$B,0)),0),` +
				`SUMIFS(${s}$D:$D,${s}$A:$A,${gr},${s}$B:$B,${ca}))`;
			cell.value = { formula: `IF(${ca}="","",IF(${v}=0,"",${v}*IF(${qty}="",1,${qty})))` };
		}
		wb.calcProperties.fullCalcOnLoad = true;
	}
	xl.addDropdowns(ws, SHEET_COLUMNS, {
		group: groupRange && { range: groupRange },
		category: catFormula && { range: catFormula },
	});
};

const templateWorkbook = async () => {
	const wb = new ExcelJS.Workbook();
	const ws = buildSheet(
		wb,
		'MẪU NHẬP GHI NHẬN CME ĐỘC LẬP',
		'Bắt buộc: Mã NV, Năm hoặc Từ ngày (dd/mm/yyyy). Giờ tín chỉ tự tính = giờ quy đổi của Loại hình thức × Số lượng (gõ đè nếu cần; loại "Khác" thì nhập tay). Nhóm / Loại hình thức: chọn từ danh sách, để trống nếu không thuộc danh mục; Nhóm hình thức chỉ cần khi Loại hình thức bị trùng tên (vd "Khác"). Cột Minh chứng không cần điền. Xoá dòng ví dụ trước khi nhập.',
	);
	ws.getRow(5).height = 30;
	ws.addRow({
		stt: 1,
		staff_number: 1234,
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

const parseWorkbook = async (buffer) => {
	const { cols, rows: sheetRows } = await readSheet(buffer, {
		matchers: COLUMN_MATCHERS,
		isValid: (c) => !!(c.full_name || c.staff_number),
		headerError:
			'Không tìm thấy dòng tiêu đề (cần cột "MNV" hoặc "Họ và tên"; các cột nhận diện: Danh mục, Nội dung, Ngày hoạt động, Số tín chỉ, Ghi chú).',
		isEmpty: (get, row) => !get(row, 'full_name') && !parseStaffNumber(get(row, 'staff_number')),
	});

	const rows = [];
	for (const { r, row, get } of sheetRows) {
		const fullName = get(row, 'full_name');
		const staffNumber = parseStaffNumber(get(row, 'staff_number'));
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
			end_date: parseDateCell(cols.end_date ? row.getCell(cols.end_date) : null),
			title: get(row, 'title') || 'Hoạt động CME',
			activity_date: parseDateCell(cols.activity_date ? row.getCell(cols.activity_date) : null),
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
			'SELECT c.id, c.name, c.conversion_value, g.name AS group_name FROM cme_credit_categories c LEFT JOIN cme_credit_groups g ON g.id = c.group_id',
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
	const conversionById = new Map(categories.recordset.map((c) => [c.id, Number(c.conversion_value) || 0]));
	return { byStaff, byName, categoryByName, categoryByGroup, conversionById };
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
		// Trống Giờ tín chỉ → tự tính = giờ quy đổi của loại × Số lượng (loại "Khác" quy đổi 0 → phải nhập tay)
		const conv = categoryId ? lookups.conversionById.get(categoryId) : 0;
		const credits = row.credits ?? (conv > 0 ? conv * (row.quantity ?? 1) : null);
		if (credits == null) warnings.push('Thiếu Giờ tín chỉ (không tự tính được từ Loại hình thức) — bỏ qua dòng này khi nhập.');

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
			credits,
			notes: row.notes,
			warnings,
			valid: !!user && !!year && credits != null,
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

module.exports = { importExcel, templateWorkbook };
