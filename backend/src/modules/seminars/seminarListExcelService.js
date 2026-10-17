/**
 * seminarListExcelService.js — Nhập / xuất Excel DANH SÁCH hội thảo, hội nghị
 * (bảng seminars). Khác seminarImportService (nhập người tham dự của MỘT sự kiện).
 *
 * - exportWorkbook(filters): mọi sự kiện khớp bộ lọc của trang danh sách.
 * - templateWorkbook(): file mẫu cùng bộ cột → xuất ra sửa rồi nhập lại được.
 * - importExcel({ buffer, dry_run }): tự dò dòng tiêu đề, khớp tên cột gần đúng;
 *   dry_run trả preview, commit tạo từng sự kiện qua seminarService.create.
 *   Bỏ qua dòng trùng (cùng tên + cùng năm) với dữ liệu đã có hoặc trong file.
 */
const ExcelJS = require('exceljs');
const { getPool } = require('../../config/db');
const { norm } = require('../../utils/vietnameseText');
const seminarService = require('./seminarService');
const xl = require('../../utils/excelTemplate');
const { ROLE, inputRoleId } = require('../access/roleCodes');
const { httpError } = require('../../utils/httpError');

const EVENT_TYPE_LABELS = {
	conference: 'Hội nghị',
	sci_seminar: 'Hội thảo khoa học',
	intl_seminar: 'Hội thảo quốc tế',
	sci_conference: 'Hội nghị khoa học',
	training: 'Tập huấn',
	other: 'Khác',
};
const SCOPE_LABELS = {
	external: 'Đơn vị ngoài tổ chức',
	hosted: 'Bệnh viện tổ chức',
};

// key = field nội bộ; header = tiêu đề cột khi xuất; match = nhận diện khi nhập
// (header đã norm()). Thứ tự mảng = thứ tự cột trong file xuất / file mẫu.
const COLUMNS = [
	{ key: 'stt', header: 'STT', width: 5, match: (h) => h === 'stt' || h === 'tt' },
	{
		key: 'title',
		header: 'Tên hội thảo/hội nghị',
		width: 48,
		match: (h) =>
			h.startsWith('ten hoi') || h === 'ten su kien' || h === 'ten' || h === 'noi dung' || h.startsWith('ten noi dung'),
	},
	{ key: 'event_type', header: 'Hình thức', width: 18, match: (h) => h === 'hinh thuc' || h === 'loai' || h === 'the loai' },
	{ key: 'scope', header: 'Phạm vi', width: 20, match: (h) => h === 'pham vi' || h === 'don vi to chuc' },
	{ key: 'start_date', header: 'Ngày bắt đầu', width: 13, match: (h) => h === 'ngay bat dau' || h === 'tu ngay' },
	{ key: 'end_date', header: 'Ngày kết thúc', width: 13, match: (h) => h === 'ngay ket thuc' || h === 'den ngay' },
	{ key: 'date_text', header: 'Thời gian (ghi chữ)', width: 18, match: (h) => h.startsWith('thoi gian') || h === 'ngay to chuc' },
	{ key: 'event_year', header: 'Năm', width: 7, match: (h) => h === 'nam' || h === 'nam to chuc' || h === 'nam su kien' },
	{ key: 'location', header: 'Địa điểm', width: 24, match: (h) => h === 'dia diem' || h === 'noi to chuc' },
	{ key: 'host_chair', header: 'Chủ trì / Chủ tọa', width: 22, match: (h) => h.startsWith('chu tri') || h.startsWith('chu toa') },
	{ key: 'speakers', header: 'Báo cáo viên', width: 28, match: (h) => h === 'bao cao vien' || h === 'dien gia' },
	{ key: 'co_organizers', header: 'Đơn vị phối hợp', width: 22, match: (h) => h.includes('phoi hop') },
	{
		key: 'permit_doc_no',
		header: 'Số giấy phép / văn bản',
		width: 18,
		match: (h) => h.includes('giay phep') || h.includes('so van ban') || h === 'so qd',
	},
	{ key: 'grants_cme', header: 'Cấp CME', width: 9, match: (h) => h === 'cap cme' || h === 'cme' || h === 'co cap cme' },
	{
		key: 'cme_default_credits',
		header: 'Số tín chỉ CME',
		width: 11,
		match: (h) => h.includes('tin chi'),
	},
	{ key: 'coordinator', header: 'Đầu mối', width: 16, match: (h) => h === 'dau moi' || h === 'nguoi phu trach' },
	{ key: 'manual_participant_count', header: 'Số người dự', width: 10, match: (h) => h === 'so nguoi du' || h === 'nguoi du' || h === 'tong so' },
	{ key: 'manual_internal_count', header: 'Nội viện', width: 9, match: (h) => h === 'noi vien' },
	{ key: 'manual_external_count', header: 'Ngoại viện', width: 9, match: (h) => h === 'ngoai vien' },
	{ key: 'manual_foreign_count', header: 'Nước ngoài', width: 9, match: (h) => h === 'nuoc ngoai' || h === 'quoc te' },
	{ key: 'manual_cme_count', header: 'Số cấp CME', width: 9, match: (h) => h === 'so cap cme' || h === 'so cme' },
	{ key: 'notes', header: 'Ghi chú', width: 26, match: (h) => h === 'ghi chu' },
];

const COUNT_KEYS = [
	'manual_participant_count',
	'manual_internal_count',
	'manual_external_count',
	'manual_foreign_count',
	'manual_cme_count',
];

const pad2 = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => {
	if (!d) return '';
	const x = d instanceof Date ? d : new Date(d);
	if (Number.isNaN(x.getTime())) return '';
	return `${pad2(x.getUTCDate())}/${pad2(x.getUTCMonth() + 1)}/${x.getUTCFullYear()}`;
};

// Cột có giá trị cố định → dropdown trong file mẫu và file xuất
const DROPDOWNS = {
	event_type: Object.values(EVENT_TYPE_LABELS),
	scope: Object.values(SCOPE_LABELS),
	grants_cme: ['Có', 'Không'],
};

// Cán bộ trong viện đang hoạt động, dạng "TS. Nguyễn Văn A" — nguồn dropdown cột
// Chủ trì / Báo cáo viên. Loại tài khoản khoa dùng chung (vai trò dept_head).
const loadStaffNames = async () => {
	const pool = await getPool();
	const r = await (await inputRoleId(pool.request(), 'dept_head_role', ROLE.DEPT_HEAD)).query(`
		SELECT u.full_name, q.code AS qualification
		FROM users u
		LEFT JOIN qualifications q ON q.id = u.qualification_id
		WHERE u.is_active = 1 AND u.role_id <> @dept_head_role AND u.full_name IS NOT NULL
	`);
	// Sắp theo tên (tên riêng rồi họ đệm, kiểu danh bạ VN), không theo học vị đứng đầu
	const firstName = (n) => n.trim().split(/\s+/).reverse().join(' ');
	const names = r.recordset
		.map((u) => ({ name: u.full_name.trim(), q: u.qualification }))
		.sort((a, b) => firstName(a.name).localeCompare(firstName(b.name), 'vi'))
		.map((u) => (u.q ? `${u.q}. ${u.name}` : u.name));
	return [...new Set(names)];
};

// Dropdown cố định + dropdown cán bộ (chọn trong viện hoặc gõ tự do người ngoài viện)
const applyDropdowns = async (wb, ws) => {
	const staffRange = xl.addLookupSheet(
		wb,
		'DS_CanBo',
		'Cán bộ trong viện (tự sinh — không sửa)',
		await loadStaffNames(),
	);
	const staff = staffRange && { range: staffRange, freeText: true };
	xl.addDropdowns(ws, COLUMNS, { ...DROPDOWNS, host_chair: staff, speakers: staff });
};

const buildSheet = (wb, title, subtitle) =>
	xl.buildSheet(wb, { sheetName: 'Hội thảo - Hội nghị', title, subtitle, columns: COLUMNS });

// ─── Xuất ───────────────────────────────────────────────────────────────────
const exportWorkbook = async (filters = {}) => {
	const { data } = await seminarService.getAll({ ...filters, page: 1, limit: 0 });

	const wb = new ExcelJS.Workbook();
	const subtitle = [
		filters.year ? `Năm ${filters.year}` : 'Tất cả các năm',
		`Xuất ngày ${fmtDate(new Date())}`,
		`${data.length} sự kiện`,
	].join(' · ');
	const ws = buildSheet(wb, 'DANH SÁCH HỘI THẢO, HỘI NGHỊ', subtitle);

	data.forEach((s, i) => {
		// Số người: ưu tiên số nhập tay, không có thì lấy số đếm từ danh sách người dự
		const pick = (manual, counted) => (manual ?? (counted || null));
		ws.addRow({
			stt: i + 1,
			title: s.title,
			event_type: EVENT_TYPE_LABELS[s.event_type] ?? s.event_type_raw ?? '',
			scope: SCOPE_LABELS[s.scope] ?? '',
			start_date: fmtDate(s.start_date),
			end_date: fmtDate(s.end_date),
			date_text: s.date_text ?? '',
			event_year: s.event_year ?? '',
			location: s.location ?? '',
			host_chair: s.host_chair ?? '',
			speakers: s.speakers ?? '',
			co_organizers: s.co_organizers ?? '',
			permit_doc_no: s.permit_doc_no ?? '',
			grants_cme: s.grants_cme ? 'Có' : 'Không',
			cme_default_credits: s.cme_default_credits ?? '',
			coordinator: s.coordinator ?? '',
			manual_participant_count: pick(s.manual_participant_count, s.participant_count),
			manual_internal_count: pick(s.manual_internal_count, s.internal_count),
			manual_external_count: pick(s.manual_external_count, s.external_count),
			manual_foreign_count: pick(s.manual_foreign_count, s.foreign_count),
			manual_cme_count: pick(s.manual_cme_count, s.cme_issued_count),
			notes: s.notes ?? '',
		});
	});
	xl.styleBody(ws);
	await applyDropdowns(wb, ws);
	return wb;
};

const templateWorkbook = async () => {
	const wb = new ExcelJS.Workbook();
	const ws = buildSheet(
		wb,
		'MẪU NHẬP DANH SÁCH HỘI THẢO, HỘI NGHỊ',
		'Bắt buộc: Tên hội thảo/hội nghị. Hình thức: Hội nghị / Hội thảo khoa học / Hội thảo quốc tế / Hội nghị khoa học / Tập huấn / Khác. Phạm vi: Bệnh viện tổ chức / Đơn vị ngoài tổ chức. Ngày dạng dd/mm/yyyy. Cấp CME: Có / Không. Chủ trì / Báo cáo viên: chọn cán bộ trong viện hoặc gõ tên người ngoài viện (nhiều người cách nhau bằng dấu ;). Xoá dòng ví dụ trước khi nhập.',
	);
	ws.getRow(2).height = 30;
	ws.addRow({
		stt: 1,
		title: 'Hội nghị khoa học thường niên (ví dụ)',
		event_type: 'Hội nghị khoa học',
		scope: 'Bệnh viện tổ chức',
		start_date: '15/10/2026',
		end_date: '16/10/2026',
		event_year: 2026,
		location: 'Hội trường A',
		host_chair: 'PGS.TS. Nguyễn Văn A',
		speakers: 'TS. Trần Thị B; ThS. Lê Văn C',
		grants_cme: 'Có',
		cme_default_credits: 8,
		manual_participant_count: 150,
		notes: '',
	});
	xl.styleBody(ws);
	ws.getRow(4).font = { italic: true, color: { argb: 'FF6B7280' } };
	await applyDropdowns(wb, ws);
	return wb;
};

// ─── Nhập ───────────────────────────────────────────────────────────────────
const cellText = (cell) => {
	if (!cell) return '';
	try {
		return String(cell.text ?? '').replace(/\s+/g, ' ').trim();
	} catch {
		return '';
	}
};

const findHeader = (workbook) => {
	for (const ws of workbook.worksheets) {
		const scanMax = Math.min(ws.actualRowCount || ws.rowCount || 0, 30);
		for (let r = 1; r <= scanMax; r++) {
			const cols = {};
			ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
				const h = norm(cellText(cell));
				if (!h) return;
				for (const c of COLUMNS) {
					if (cols[c.key] == null && c.match(h)) {
						cols[c.key] = col;
						break;
					}
				}
			});
			if (cols.title) return { ws, headerRow: r, cols };
		}
	}
	return null;
};

// Trả 'YYYY-MM-DD' hoặc null (kèm raw để đẩy vào date_text nếu không parse được)
const parseDate = (cell) => {
	if (!cell) return { date: null, raw: '' };
	const v = cell.value;
	if (v instanceof Date && !Number.isNaN(v.getTime())) {
		return {
			date: `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())}`,
			raw: '',
		};
	}
	const raw = cellText(cell).replace(/^['"\s]+/, '');
	const m = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
	if (m && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12) {
		return { date: `${m[3]}-${pad2(+m[2])}-${pad2(+m[1])}`, raw: '' };
	}
	const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (iso) return { date: raw, raw: '' };
	return { date: null, raw };
};

const parseEventType = (s) => {
	const n = norm(s);
	if (!n) return { event_type: 'other', event_type_raw: null };
	for (const [k, label] of Object.entries(EVENT_TYPE_LABELS)) {
		if (n === norm(label) || n === k) return { event_type: k, event_type_raw: null };
	}
	if (n.includes('quoc te')) return { event_type: 'intl_seminar', event_type_raw: s };
	if (n.includes('tap huan') || n.includes('dao tao')) return { event_type: 'training', event_type_raw: s };
	if (n.includes('hoi nghi') && n.includes('khoa hoc')) return { event_type: 'sci_conference', event_type_raw: s };
	if (n.includes('hoi thao')) return { event_type: 'sci_seminar', event_type_raw: s };
	if (n.includes('hoi nghi')) return { event_type: 'conference', event_type_raw: s };
	return { event_type: 'other', event_type_raw: s };
};

const parseScope = (s) => {
	const n = norm(s);
	if (!n) return 'hosted';
	if (n.includes('ngoai') || n.includes('cu nguoi') || n.includes('cu di') || n === 'external') return 'external';
	return 'hosted';
};

const parseBool = (s) => {
	const n = norm(s);
	return ['co', 'x', '1', 'yes', 'true', 'dat'].includes(n);
};

const parseNum = (s) => {
	const t = String(s || '').replace(',', '.').trim();
	if (!t) return null;
	const n = parseFloat(t);
	return Number.isFinite(n) ? n : NaN;
};

const dupKey = (title, year) => `${norm(title)}|${year ?? ''}`;

const parseRows = async (buffer) => {
	const workbook = new ExcelJS.Workbook();
	try {
		await workbook.xlsx.load(buffer);
	} catch {
		throw httpError(400, 'File không đọc được — cần file .xlsx hợp lệ.');
	}
	const header = findHeader(workbook);
	if (!header) {
		throw Object.assign(
			new Error(
				'Không tìm thấy dòng tiêu đề (cần ít nhất cột "Tên hội thảo/hội nghị"). Hãy dùng file mẫu hoặc file xuất từ hệ thống.',
			),
			{ statusCode: 400 },
		);
	}
	const { ws, headerRow, cols } = header;
	const cell = (row, key) => (cols[key] ? row.getCell(cols[key]) : null);
	const text = (row, key) => cellText(cell(row, key));

	const rows = [];
	const last = ws.actualRowCount || ws.rowCount || 0;
	for (let r = headerRow + 1; r <= last; r++) {
		const row = ws.getRow(r);
		const title = text(row, 'title');
		if (!title) continue;
		// Bỏ dòng ví dụ trong file mẫu nếu người dùng quên xoá
		if (/\(ví dụ\)\s*$/i.test(title)) continue;

		const warnings = [];
		const errors = [];
		const start = parseDate(cell(row, 'start_date'));
		const end = parseDate(cell(row, 'end_date'));
		let dateText = text(row, 'date_text') || null;
		if (start.raw) {
			warnings.push(`Ngày bắt đầu "${start.raw}" không đúng dạng dd/mm/yyyy — lưu vào "Thời gian (ghi chữ)"`);
			dateText = dateText || start.raw;
		}
		if (end.raw) warnings.push(`Ngày kết thúc "${end.raw}" không đúng dạng dd/mm/yyyy — bỏ qua`);
		if (start.date && end.date && end.date < start.date) {
			errors.push('Ngày kết thúc trước ngày bắt đầu');
		}

		const yearRaw = text(row, 'event_year');
		let eventYear = null;
		if (yearRaw) {
			eventYear = parseInt(yearRaw, 10);
			if (!(eventYear >= 1990 && eventYear <= 2100)) {
				errors.push(`Năm "${yearRaw}" không hợp lệ`);
				eventYear = null;
			}
		} else {
			const src = start.date || dateText;
			const m = src && String(src).match(/(20\d{2})/);
			eventYear = m ? parseInt(m[1], 10) : null;
		}

		const credits = parseNum(text(row, 'cme_default_credits'));
		if (Number.isNaN(credits) || (credits !== null && credits < 0)) {
			errors.push(`Số tín chỉ "${text(row, 'cme_default_credits')}" không hợp lệ`);
		}

		const counts = {};
		for (const k of COUNT_KEYS) {
			const raw = text(row, k);
			const n = parseNum(raw);
			if (n === null) counts[k] = null;
			else if (Number.isNaN(n) || n < 0 || !Number.isInteger(n)) {
				errors.push(`${COLUMNS.find((c) => c.key === k).header} "${raw}" phải là số nguyên ≥ 0`);
				counts[k] = null;
			} else counts[k] = n;
		}

		const { event_type, event_type_raw } = parseEventType(text(row, 'event_type'));
		if (event_type_raw) warnings.push(`Hình thức "${event_type_raw}" được quy về "${EVENT_TYPE_LABELS[event_type]}"`);

		const creditsVal = Number.isNaN(credits) ? null : credits;
		const grantsRaw = text(row, 'grants_cme');
		rows.push({
			row: r,
			title,
			event_type,
			event_type_raw,
			scope: parseScope(text(row, 'scope')),
			start_date: start.date,
			end_date: end.date,
			date_text: dateText,
			event_year: eventYear,
			location: text(row, 'location') || null,
			host_chair: text(row, 'host_chair') || null,
			speakers: text(row, 'speakers') || null,
			co_organizers: text(row, 'co_organizers') || null,
			permit_doc_no: text(row, 'permit_doc_no') || null,
			// Không điền cột "Cấp CME" nhưng có số tín chỉ → coi như có cấp CME
			grants_cme: grantsRaw ? parseBool(grantsRaw) : creditsVal !== null && creditsVal > 0,
			cme_default_credits: creditsVal,
			coordinator: text(row, 'coordinator') || null,
			notes: text(row, 'notes') || null,
			...counts,
			warnings,
			errors,
			duplicate: false,
		});
	}
	return rows;
};

const importExcel = async ({ buffer, dry_run }, actorId) => {
	const rows = await parseRows(buffer);
	if (rows.length === 0) {
		throw httpError(400, 'File không có dòng dữ liệu nào (cột "Tên hội thảo/hội nghị" trống).');
	}

	// Đánh dấu trùng: cùng tên (bỏ dấu, không phân biệt hoa thường) + cùng năm
	const pool = await getPool();
	const existing = await pool.request().query('SELECT title, event_year FROM seminars');
	const seen = new Set(existing.recordset.map((s) => dupKey(s.title, s.event_year)));
	for (const r of rows) {
		const k = dupKey(r.title, r.event_year);
		if (seen.has(k)) {
			r.duplicate = true;
			r.warnings.push('Đã có sự kiện cùng tên trong cùng năm — sẽ bỏ qua');
		}
		seen.add(k);
	}

	const importable = rows.filter((r) => !r.duplicate && r.errors.length === 0);
	const summary = {
		total: rows.length,
		importable: importable.length,
		duplicates: rows.filter((r) => r.duplicate).length,
		invalid: rows.filter((r) => r.errors.length > 0).length,
	};

	if (dry_run) return { dry_run: true, summary, rows };

	let inserted = 0;
	const failures = [];
	for (const r of importable) {
		try {
			await seminarService.create(r, actorId);
			inserted += 1;
		} catch (e) {
			failures.push(`Dòng ${r.row} (${r.title}): ${e.message}`);
		}
	}
	return { dry_run: false, summary, inserted, failures };
};

module.exports = { exportWorkbook, templateWorkbook, importExcel, parseRows };
