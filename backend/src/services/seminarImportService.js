/**
 * seminarImportService.js — Nhập danh sách người tham dự của MỘT hội thảo từ
 * file Excel (mẫu "Danh sách cấp CME nội/ngoại viện" — file 1.2 / 1.3 trong
 * docs/). Tự dò dòng tiêu đề + khớp tên cột gần đúng (như councilImportService).
 *
 * Luồng: parse file → mỗi dòng 1 người, khớp cán bộ nội viện theo MNV rồi họ tên
 * → dry_run trả preview; commit bulk-insert vào seminar_participants, và nếu
 * chọn "cấp CME" thì sinh dải số quyết định (SQĐ) tuần tự cho toàn bộ người vừa
 * nhập (qua seminarParticipantService.issueCme).
 */
const ExcelJS = require('exceljs');
const { getPool, sql } = require('../config/db');
const { norm, normDept, stripQualification } = require('../utils/vietnameseText');
const partService = require('./seminarParticipantService');
const { ROLE, inputRoleId } = require('./roleCodes');

// ─── Khớp tên cột: header đã norm() → field nội bộ ──────────────────────────
// Duyệt từ mẫu cụ thể tới chung chung; chỉ nhận cột ĐẦU TIÊN match mỗi field.
const COLUMN_MATCHERS = [
	['stt', (h) => h === 'stt' || h === 'tt' || h === 'so tt'],
	[
		'sqd_raw',
		(h) =>
			h === 'sqd' ||
			h.includes('so quyet dinh') ||
			h.includes('so chung nhan') ||
			h === 'so cn' ||
			h === 'so qd',
	],
	['title_prefix', (h) => h === 'ong ba' || h === 'danh xung' || h === 'ong'],
	[
		'full_name',
		(h) =>
			h === 'ho va ten' ||
			h === 'ho ten' ||
			h === 'ho va ten dem' ||
			h === 'ho ten dem' ||
			h === 'ten dai bieu' ||
			h === 'ho va ten khai sinh',
	],
	[
		'dob',
		(h) =>
			h.includes('ngay sinh') ||
			h === 'sinh ngay' ||
			h.includes('ngay thang nam sinh') ||
			h === 'nam sinh' ||
			h === 'ngay thang nam sinh',
	],
	['gender', (h) => h === 'gioi tinh' || h === 'phai'],
	[
		'organization',
		(h) =>
			h.includes('don vi cong tac') ||
			h === 'don vi' ||
			h === 'co quan' ||
			h === 'noi cong tac' ||
			h.includes('don vi cong tac hien tai'),
	],
	[
		'department_raw',
		(h) =>
			h === 'khoa phong' ||
			h === 'khoa' ||
			h.includes('khoa phong tt') ||
			h === 'phong ban' ||
			h.includes('khoa phong don vi'),
	],
	[
		'staff_number',
		(h) =>
			h === 'mnv' ||
			h === 'ma nv' ||
			h.includes('ma nhan vien') ||
			h === 'ma so nv' ||
			h === 'ma so nhan vien' ||
			h === 'ma cb',
	],
	[
		'qualification_raw',
		(h) =>
			h === 'tdcm' ||
			h.includes('trinh do chuyen mon') ||
			h === 'trinh do' ||
			h === 'hoc vi' ||
			h === 'hoc ham hoc vi',
	],
	[
		'cme_credits',
		(h) =>
			h.includes('so tin chi') ||
			h === 'tin chi' ||
			h === 'so tc' ||
			h === 'tc',
	],
	['participation_type', (h) => h === 'vai tro' || h === 'chuc danh'],
	['source', (h) => h === 'nguon' || h === 'pham vi' || h === 'doi tuong'],
	[
		'is_foreign',
		(h) => h === 'quoc tich' || h.includes('nuoc ngoai') || h === 'quoc gia',
	],
	[
		'notes',
		(h) =>
			h === 'ghi chu' ||
			h === 'sua doi' ||
			h.includes('ky nhan cme') ||
			h === 'ky nhan' ||
			h === 'chu thich',
	],
];

const ROLE_BY_NORM = {
	'dai bieu': 'attendee',
	'tham du': 'attendee',
	'hoc vien': 'trainee',
	'bao cao vien': 'speaker',
	'giang vien': 'speaker',
	'chu toa': 'chair',
	'chu tich': 'chair',
	'chu tri': 'chair',
	'ban to chuc': 'organizer',
	'to chuc': 'organizer',
};

const cellText = (cell) => {
	if (!cell) return '';
	try {
		return String(cell.text ?? '').replace(/\s+/g, ' ').trim();
	} catch {
		return '';
	}
};

// ─── Parse giá trị từng ô ───────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');

// Trả { dob: 'YYYY-MM-DD'|null, dob_text: string|null }. Nguồn rất tạp: ô ngày
// thật, "12/9/1984", chỉ có năm "1989", "tháng 3/1990"…
const parseDob = (cell) => {
	if (!cell) return { dob: null, dob_text: null };
	const v = cell.value;
	if (v instanceof Date && !Number.isNaN(v.getTime())) {
		// exceljs lưu ngày ở UTC — đọc theo UTC để giữ đúng ngày lịch.
		return {
			dob: `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())}`,
			dob_text: null,
		};
	}
	// Excel hay chèn dấu ' đầu ô để ép kiểu chữ; bỏ trước khi parse.
	const raw = cellText(cell).replace(/^['"\s]+/, '').trim();
	if (!raw) return { dob: null, dob_text: null };

	// dd/mm/yyyy hoặc d-m-yyyy
	let m = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
	if (m) {
		const d = +m[1];
		const mo = +m[2];
		const y = +m[3];
		if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
			return { dob: `${y}-${pad2(mo)}-${pad2(d)}`, dob_text: null };
		}
	}
	// mm/yyyy → không đủ ngày
	m = raw.match(/(\d{1,2})[/\-.](\d{4})$/);
	if (m) return { dob: null, dob_text: raw };
	// chỉ năm
	if (/^\d{4}$/.test(raw)) return { dob: null, dob_text: raw };

	return { dob: null, dob_text: raw };
};

// "3,5" / "3.5" / "3" → number; rỗng → null
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

const normGender = (s) => {
	const n = norm(s);
	if (n.startsWith('nam')) return 'Nam';
	if (n.startsWith('nu')) return 'Nữ';
	return null;
};

// Tách "Ông Nguyễn Văn A" / "Bà. Trần Thị B" → { title_prefix, full_name }
const splitTitlePrefix = (name, prefixCol) => {
	let full = String(name || '').replace(/\s+/g, ' ').trim();
	let prefix = String(prefixCol || '').replace(/\s+/g, ' ').trim();
	const m = full.match(/^(Ông|Bà|Ong|Ba|Anh|Chị|Chi|Bác|Bac)[\s.,]+(.+)$/i);
	if (m) {
		if (!prefix) prefix = /^b/i.test(m[1]) && !/^bac/i.test(m[1]) ? 'Bà' : 'Ông';
		full = m[2].trim();
	}
	if (/^ong$/i.test(prefix)) prefix = 'Ông';
	else if (/^ba$/i.test(prefix)) prefix = 'Bà';
	return { title_prefix: prefix || null, full_name: full };
};

const parseRole = (s) => {
	const n = norm(s);
	if (!n) return 'attendee';
	if (ROLE_BY_NORM[n]) return ROLE_BY_NORM[n];
	for (const [k, v] of Object.entries(ROLE_BY_NORM)) {
		if (n.includes(k)) return v;
	}
	return 'attendee';
};

const isForeignValue = (s) => {
	const n = norm(s);
	if (!n) return false;
	if (n === 'viet nam' || n === 'vn' || n === 'vietnam' || n === 'khong') return false;
	return true;
};

// ─── Dò dòng tiêu đề ───────────────────────────────────────────────────────
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
			// Cần tối thiểu cột họ tên để coi là dòng tiêu đề hợp lệ.
			if (cols.full_name) {
				return { ws, headerRow: r, cols };
			}
		}
	}
	return null;
};

// ─── Đọc toàn bộ file → mảng dòng thô ──────────────────────────────────────
const parseWorkbook = async (buffer) => {
	const workbook = new ExcelJS.Workbook();
	try {
		await workbook.xlsx.load(buffer);
	} catch {
		throw Object.assign(
			new Error('File không đọc được — cần file .xlsx hợp lệ.'),
			{ statusCode: 400 },
		);
	}
	const header = findHeader(workbook);
	if (!header) {
		throw Object.assign(
			new Error(
				'Không tìm thấy dòng tiêu đề (cần ít nhất cột "Họ và tên"; các cột nhận diện: SQĐ, Ông/Bà, Ngày sinh, Giới tính, Đơn vị công tác, Khoa/phòng, MNV, Số tín chỉ, Vai trò, Ghi chú).',
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
		const rawName = get(row, 'full_name');
		if (!rawName) {
			emptyStreak++;
			continue;
		}
		emptyStreak = 0;

		const { title_prefix, full_name } = splitTitlePrefix(
			rawName,
			get(row, 'title_prefix'),
		);
		if (!full_name) continue;

		const { dob, dob_text } = parseDob(
			cols.dob ? row.getCell(cols.dob) : null,
		);
		rows.push({
			row: r,
			raw_name: rawName,
			title_prefix,
			full_name,
			dob,
			dob_text,
			gender: normGender(get(row, 'gender')),
			organization: get(row, 'organization') || null,
			department_raw: get(row, 'department_raw') || null,
			staff_number: parseStaffNumber(get(row, 'staff_number')),
			qualification_raw: get(row, 'qualification_raw') || null,
			cme_credits: parseCredits(get(row, 'cme_credits')),
			participation_type: parseRole(get(row, 'participation_type')),
			source_raw: get(row, 'source'),
			is_foreign: cols.is_foreign ? isForeignValue(get(row, 'is_foreign')) : false,
			notes: get(row, 'notes') || null,
			sqd_raw: get(row, 'sqd_raw') || null,
		});
	}
	if (!rows.length) {
		throw Object.assign(new Error('File không có dòng dữ liệu nào.'), {
			statusCode: 400,
		});
	}
	return { rows, matchedColumns: Object.keys(cols) };
};

// ─── Khớp cán bộ nội viện ──────────────────────────────────────────────────
const loadUsers = async () => {
	const pool = await getPool();
	// Loại tài khoản khoa dùng chung (vai trò dept_head) — không phải một người
	const r = await (await inputRoleId(pool.request(), 'dept_head_role', ROLE.DEPT_HEAD)).query(`
		SELECT u.id, u.full_name, u.staff_number, d.name AS department_name
		FROM users u
		LEFT JOIN departments d ON d.id = u.department_id
		WHERE u.is_active = 1 AND u.role_id <> @dept_head_role
	`);
	const byStaff = new Map();
	const byName = new Map();
	for (const u of r.recordset) {
		if (u.staff_number != null) byStaff.set(Number(u.staff_number), u);
		const key = norm(stripQualification(u.full_name));
		if (!byName.has(key)) byName.set(key, []);
		byName.get(key).push(u);
	}
	return { byStaff, byName };
};

const matchUser = (row, db) => {
	if (row.staff_number != null && db.byStaff.has(row.staff_number)) {
		return { user: db.byStaff.get(row.staff_number), by: 'staff_number' };
	}
	const key = norm(stripQualification(row.full_name));
	const cands = db.byName.get(key) || [];
	if (cands.length === 1) return { user: cands[0], by: 'name' };
	if (cands.length > 1) {
		// Trùng tên — thử phân xử bằng khoa ghi trong file.
		const dKey = normDept(row.department_raw || row.organization || '');
		if (dKey) {
			const byDept = cands.filter((u) => {
				const ud = normDept(u.department_name || '');
				return ud && ud === dKey;
			});
			if (byDept.length === 1) return { user: byDept[0], by: 'name+dept' };
		}
		return { user: null, ambiguous: cands.length };
	}
	return { user: null };
};

// ─── Build preview ─────────────────────────────────────────────────────────
const SOURCE_FROM_RAW = (raw) => {
	const n = norm(raw);
	if (!n) return null;
	if (n.includes('noi vien') || n === 'internal' || n.includes('trong vien')) {
		return 'internal';
	}
	if (n.includes('ngoai vien') || n === 'external' || n.includes('ngoai')) {
		return 'external';
	}
	return null;
};

const buildPreview = (rows, db) => {
	return rows.map((row) => {
		const warnings = [];
		const match = matchUser(row, db);
		if (match.ambiguous) {
			warnings.push(
				`Trùng tên với ${match.ambiguous} cán bộ — không tự liên kết, sẽ lưu dạng ngoại viện.`,
			);
		}
		let source = SOURCE_FROM_RAW(row.source_raw);
		if (!source) source = match.user ? 'internal' : 'external';
		// Có liên kết cán bộ thì luôn là nội viện.
		if (match.user) source = 'internal';

		if (!row.dob && row.dob_text) {
			warnings.push(`Ngày sinh "${row.dob_text}" không đủ dạng ngày — lưu dạng chữ.`);
		}
		if (source === 'internal' && !match.user) {
			warnings.push('Ghi nội viện nhưng không tìm thấy cán bộ trùng khớp.');
		}

		return {
			row: row.row,
			raw_name: row.raw_name,
			title_prefix: row.title_prefix,
			full_name: match.user ? match.user.full_name : row.full_name,
			dob: row.dob,
			dob_text: row.dob_text,
			gender: row.gender,
			organization: source === 'external' ? row.organization : null,
			department_raw: row.department_raw,
			staff_number: row.staff_number ?? (match.user ? match.user.staff_number : null),
			qualification_raw: row.qualification_raw,
			cme_credits: row.cme_credits,
			participation_type: row.participation_type,
			source,
			is_foreign: row.is_foreign,
			matched_user: match.user
				? {
						id: match.user.id,
						full_name: match.user.full_name,
						department_name: match.user.department_name || null,
					}
				: null,
			warnings,
		};
	});
};

const previewToParticipant = (p) => ({
	user_id: p.matched_user ? p.matched_user.id : null,
	title_prefix: p.title_prefix,
	full_name: p.full_name,
	dob: p.dob,
	dob_text: p.dob_text,
	gender: p.gender,
	organization: p.organization,
	department_raw: p.department_raw,
	staff_number: p.staff_number,
	qualification_raw: p.qualification_raw,
	source: p.source,
	is_foreign: p.is_foreign,
	participation_type: p.participation_type,
	cme_credits: p.cme_credits,
	notes: p.notes ?? null,
});

// ─── API chính ─────────────────────────────────────────────────────────────
const importExcel = async ({ buffer, seminar_id, dry_run, issue_cme }, actorId) => {
	const pool = await getPool();
	const semRes = await pool
		.request()
		.input('id', sql.VarChar(20), seminar_id)
		.query(
			'SELECT id, event_year, grants_cme, cme_default_credits FROM seminars WHERE id = @id',
		);
	if (!semRes.recordset.length) {
		throw Object.assign(new Error('Hội thảo/hội nghị không tồn tại.'), {
			statusCode: 404,
		});
	}
	const seminar = semRes.recordset[0];

	const { rows: rawRows } = await parseWorkbook(buffer);
	const db = await loadUsers();
	const preview = buildPreview(rawRows, db);

	const warnings = [];
	for (const p of preview) {
		for (const w of p.warnings) {
			warnings.push(`Dòng ${p.row} (${p.raw_name}): ${w}`);
		}
	}

	const wantCme = !!issue_cme && !!seminar.grants_cme;
	if (issue_cme && !seminar.grants_cme) {
		warnings.push('Hội thảo này không cấp CME — bỏ qua yêu cầu cấp số CME.');
	}
	if (wantCme && !seminar.event_year) {
		warnings.push(
			'Chưa đặt "Năm sự kiện" cho hội nghị — sẽ nhập người nhưng không cấp được số CME.',
		);
	}

	const summary = {
		total: preview.length,
		matched: preview.filter((p) => p.matched_user).length,
		internal: preview.filter((p) => p.source === 'internal').length,
		external: preview.filter((p) => p.source === 'external').length,
		with_credits: preview.filter((p) => p.cme_credits != null).length,
	};

	if (dry_run) {
		return { dry_run: true, rows: preview, summary, warnings };
	}

	// Commit — bulk insert rồi (nếu cần) cấp SQĐ tuần tự theo thứ tự file.
	const { inserted, ids } = await partService.bulkAdd(
		seminar_id,
		preview.map(previewToParticipant),
		actorId,
	);

	let cme = { issued: 0, from: null, to: null, year: null };
	if (wantCme && seminar.event_year && ids.length) {
		try {
			cme = await partService.issueCme(seminar_id, ids, actorId, {
				year: seminar.event_year,
			});
		} catch (e) {
			// Người đã nhập xong — chỉ bước cấp số CME lỗi, để người dùng cấp lại
			// từ nút "Cấp CME" trên danh sách.
			warnings.push(
				`Đã nhập người nhưng chưa cấp được số CME: ${e.message}. Hãy chọn các dòng và bấm "Cấp CME".`,
			);
		}
	}

	return {
		dry_run: false,
		inserted,
		cme_issued: cme.issued,
		cme_from: cme.from,
		cme_to: cme.to,
		cme_year: cme.year,
		warnings,
	};
};

module.exports = { importExcel };
module.exports._internal = { parseWorkbook, buildPreview, findHeader };
