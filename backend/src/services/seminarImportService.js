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
const { getPool, sql } = require('../config/db');
const { norm, normDept, stripQualification } = require('../utils/vietnameseText');
const ExcelJS = require('exceljs');
const { parseDob, parseCredits, parseStaffNumber, readSheet } = require('../utils/excelImport');
const { normalizeGender } = require('../utils/gender');
const partService = require('./seminarParticipantService');
const { ROLE, inputRoleId } = require('./roleCodes');
const xl = require('../utils/excelTemplate');
const { httpError } = require('../utils/httpError');

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

// Nhận "Nam"/"Nữ"/"Khác" trong file → mã lưu DB (xem utils/gender).
const normGender = normalizeGender;

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

// ─── Đọc toàn bộ file → mảng dòng thô ──────────────────────────────────────
const parseWorkbook = async (buffer) => {
	const { cols, rows: sheetRows } = await readSheet(buffer, {
		matchers: COLUMN_MATCHERS,
		isValid: (c) => !!c.full_name,
		headerError:
			'Không tìm thấy dòng tiêu đề (cần ít nhất cột "Họ và tên"; các cột nhận diện: SQĐ, Ông/Bà, Ngày sinh, Giới tính, Đơn vị công tác, Khoa/phòng, MNV, Số tín chỉ, Vai trò, Ghi chú).',
		isEmpty: (get, row) => !get(row, 'full_name'),
	});

	const rows = [];
	for (const { r, row, get } of sheetRows) {
		const rawName = get(row, 'full_name');

		// Dòng ví dụ của file mẫu (ghi chú "Dòng ví dụ…") — bỏ qua nếu quên xoá
		if (/^dong vi du/.test(norm(get(row, 'notes')))) continue;

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
		throw httpError(400, 'File không có dòng dữ liệu nào.');
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
			notes: row.notes,
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
// Chuẩn hoá { vai_trò: số tín chỉ } gửi từ client — bỏ key lạ / giá trị không hợp lệ
const normalizeCreditsByRole = (raw) => {
	let obj = raw;
	if (typeof raw === 'string') {
		try {
			obj = JSON.parse(raw);
		} catch {
			obj = null;
		}
	}
	const out = {};
	if (!obj || typeof obj !== 'object') return out;
	for (const role of Object.values(ROLE_BY_NORM)) {
		const n = parseCredits(obj[role]);
		if (n != null && n >= 0 && n < 1000) out[role] = n;
	}
	return out;
};

const importExcel = async (
	{ buffer, seminar_id, dry_run, issue_cme, credits_by_role },
	actorId,
) => {
	const pool = await getPool();
	const semRes = await pool
		.request()
		.input('id', sql.VarChar(20), seminar_id)
		.query(
			'SELECT id, event_year, grants_cme, cme_default_credits FROM seminars WHERE id = @id',
		);
	if (!semRes.recordset.length) {
		throw httpError(404, 'Hội thảo/hội nghị không tồn tại.');
	}
	const seminar = semRes.recordset[0];

	const { rows: rawRows } = await parseWorkbook(buffer);
	const db = await loadUsers();
	const preview = buildPreview(rawRows, db);

	// Số tín chỉ: ô trong file được ưu tiên; ô trống lấy mặc định theo vai trò
	// người dùng nhập ở màn hình nhập (VD đại biểu 3, báo cáo viên 6).
	const creditsByRole = normalizeCreditsByRole(credits_by_role);
	for (const p of preview) {
		if (p.cme_credits != null) p.credits_source = 'file';
		else if (creditsByRole[p.participation_type] != null) {
			p.cme_credits = creditsByRole[p.participation_type];
			p.credits_source = 'default';
		} else p.credits_source = null;
	}

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

// ─── File mẫu ───────────────────────────────────────────────────────────────
// Tiêu đề cột khớp COLUMN_MATCHERS ở trên → tải mẫu, điền, nhập lại được ngay.
const TEMPLATE_COLUMNS = [
	{ key: 'stt', header: 'STT', width: 5 },
	{ key: 'title_prefix', header: 'Ông/Bà', width: 8 },
	{ key: 'full_name', header: 'Họ và tên', width: 26 },
	{ key: 'dob', header: 'Ngày sinh', width: 12 },
	{ key: 'gender', header: 'Giới tính', width: 9 },
	{ key: 'organization', header: 'Đơn vị công tác', width: 26 },
	{ key: 'department_raw', header: 'Khoa/phòng', width: 18 },
	{ key: 'staff_number', header: 'MNV', width: 8 },
	{ key: 'qualification_raw', header: 'TĐCM', width: 10 },
	{ key: 'participation_type', header: 'Vai trò', width: 14 },
	{ key: 'source', header: 'Nguồn', width: 11 },
	{ key: 'is_foreign', header: 'Quốc tịch', width: 11 },
	{ key: 'cme_credits', header: 'Số tín chỉ', width: 9 },
	{ key: 'notes', header: 'Ghi chú', width: 22 },
];

const templateWorkbook = () => {
	const wb = new ExcelJS.Workbook();
	const ws = xl.buildSheet(wb, {
		sheetName: 'Người tham dự',
		title: 'MẪU NHẬP DANH SÁCH NGƯỜI THAM DỰ HỘI THẢO / HỘI NGHỊ',
		subtitle:
			'Bắt buộc: Họ và tên. Cán bộ nội viện nên ghi MNV để tự khớp. Ngày sinh dd/mm/yyyy (hoặc chỉ năm). Số tín chỉ để trống sẽ lấy mặc định theo vai trò chọn khi nhập. Quốc tịch để trống = Việt Nam. Xoá 2 dòng ví dụ trước khi nhập.',
		columns: TEMPLATE_COLUMNS,
	});
	ws.getRow(2).height = 30;
	const note = 'Dòng ví dụ — xoá trước khi nhập';
	ws.addRow({
		stt: 1,
		title_prefix: 'Ông',
		full_name: 'Nguyễn Văn A',
		dob: '12/09/1984',
		gender: 'Nam',
		department_raw: 'Khoa Nội tim mạch',
		staff_number: 1234,
		qualification_raw: 'BSCKII',
		participation_type: 'Báo cáo viên',
		source: 'Nội viện',
		cme_credits: 6,
		notes: note,
	});
	ws.addRow({
		stt: 2,
		title_prefix: 'Bà',
		full_name: 'Trần Thị B',
		dob: '1990',
		gender: 'Nữ',
		organization: 'Bệnh viện Đa khoa tỉnh X',
		qualification_raw: 'ThS',
		participation_type: 'Đại biểu',
		source: 'Ngoại viện',
		notes: note,
	});
	xl.styleBody(ws);
	[4, 5].forEach((r) => (ws.getRow(r).font = { italic: true, color: { argb: 'FF6B7280' } }));
	xl.addDropdowns(ws, TEMPLATE_COLUMNS, {
		title_prefix: ['Ông', 'Bà'],
		gender: ['Nam', 'Nữ'],
		participation_type: ['Đại biểu', 'Báo cáo viên', 'Chủ tọa', 'Ban tổ chức', 'Học viên'],
		source: ['Nội viện', 'Ngoại viện'],
	});
	return wb;
};

module.exports = { importExcel, templateWorkbook };
