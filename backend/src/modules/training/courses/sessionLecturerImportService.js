/**
 * sessionLecturerImportService.js — Nhập "Kế hoạch giảng dạy" (giảng viên chính + trợ giảng
 * từng phần LT / TH của mỗi bài) từ Excel vào các buổi học ĐÃ XẾP của 1 khóa (tab "Bài học &
 * lịch học"). Bố cục file: exports/teachingPlanTemplate; file mẫu: teachingPlanService.
 *
 * Mỗi dòng = 1 phần của 1 bài: Mã bài / Nội dung (ô gộp theo khối bài) | LT hoặc TH |
 * Mã NV + Giảng viên chính | Mã NV + Trợ giảng (nhiều người, dấu ;) | Thời gian giảng.
 *
 * Quy tắc:
 *  - Bài khớp theo MÃ, không có mã thì theo tên — chỉ các bài của khóa. Ô bài trống (khối
 *    không gộp ô) ⇒ lấy bài của dòng trên.
 *  - Dòng áp cho các buổi của bài cùng loại LT / TH (buổi chưa ghi loại tính như LT — giống
 *    bảng điểm) có ngày trong khoảng "Thời gian giảng" (trống = mọi buổi của phần đó; ghi kèm
 *    giờ "(07:30)" ⇒ chỉ buổi bắt đầu đúng giờ đó). Không tự tạo buổi: phần chưa có buổi nào
 *    trong khoảng ⇒ bỏ qua dòng, nhắc xếp lịch trước.
 *  - Mỗi buổi khớp: GV chính = giảng viên chính của dòng, trợ giảng = đúng danh sách trợ giảng
 *    của dòng (session_lecturers). Dòng trống cả GV chính lẫn trợ giảng ⇒ giữ nguyên.
 *  - 1 buổi chỉ thuộc 1 dòng: dòng sau trùng buổi với dòng trước ⇒ bỏ qua cả dòng sau.
 *  - Giảng viên: Mã NV ⇒ tìm nhân sự theo mã rồi đối chiếu họ tên; không mã ⇒ theo họ tên
 *    (sessionLecturerResolver). Lỗi ở bất kỳ người nào ⇒ bỏ qua cả dòng.
 * dry_run trả bản xem trước, không ghi DB. Ghi từng buổi qua classSessionService.updateSession
 * (kiểm học viên làm GV, tự tạo hồ sơ GV cho nhân viên có CCHN, đồng bộ phân công GV theo bài).
 */
const { getPool, sql } = require('../../../config/db');
const { norm } = require('../../../utils/vietnameseText');
const {
	readSheet,
	cellText,
	parseDateText,
	parseStaffNumber,
} = require('../../../utils/excelImport');
const { isLecturerTotalsRow } = require('../../../utils/excelLecturerTotals');
const { badRequest, httpError } = require('../../../utils/httpError');
const { fmtDateVN } = require('../../../utils/vnDate');
const lecturerAssignmentService = require('./lecturerAssignmentService');
const classSessionService = require('./classSessionService');
const {
	createStaffResolver,
	createLecturerResolver,
	splitLecturerCell,
	splitStaffCell,
} = require('./sessionLecturerResolver');

const MATCHERS = [
	['code', (h) => h === 'ma bai' || h === 'ma bai hoc'],
	[
		'title',
		(h) =>
			h.startsWith('noi dung bai giang') ||
			h === 'noi dung' ||
			h === 'ten bai hoc' ||
			h === 'bai hoc',
	],
	['kind', (h) => h === 'so tiet' || h === 'lt/th' || h === 'loai buoi' || h === 'phan'],
	// File mẫu mới ghi "Mã NV giảng viên" / "Giảng viên"; file cũ "… GV chính" / "Giảng viên chính"
	['main_code', (h) => h.startsWith('ma nv gv chinh') || h.startsWith('ma nv giang vien')],
	['main', (h) => h.startsWith('giang vien chinh') || h === 'gv chinh' || h === 'giang vien'],
	['asst_code', (h) => h.startsWith('ma nv tro giang')],
	['asst', (h) => h.startsWith('tro giang')],
	['time', (h) => h.startsWith('thoi gian giang') || h === 'thoi gian'],
];
const PEOPLE = ['main_code', 'main', 'asst_code', 'asst'];

const tidy = (s) =>
	String(s || '')
		.replace(/\s+/g, ' ')
		.trim();
const cleanCode = (s) =>
	String(s || '')
		.replace(/\s+/g, '')
		.toUpperCase();
const pad2 = (n) => String(n).padStart(2, '0');

/** "LT" / "Lý thuyết" → 'theory'; "TH" / "Thực hành" → 'practice'; trống → ''; khác → null. */
const parseKind = (raw) => {
	const k = norm(raw);
	if (!k) return '';
	if (['lt', 'ly thuyet', 'theory'].includes(k)) return 'theory';
	if (['th', 'thuc hanh', 'practice'].includes(k)) return 'practice';
	return null;
};

const ymdUtc = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const DATE_RE = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/g;

/**
 * "Từ ngày 27/11/2026 đến ngày 05/12/2026" / "27/11/2026" / "25/11/2026 (07:30)" →
 * { from, to, start } (start = giờ bắt đầu 'hh:mm' hoặc null); trống / chỉ chữ mẫu
 * ("Từ ngày….. đến ngày…") ⇒ {} (mọi buổi); sai ⇒ { error }.
 */
const parseTimeText = (raw) => {
	const t = tidy(raw);
	if (!/\d/.test(t)) return {};
	const dates = [...t.matchAll(DATE_RE)].map((m) => parseDateText(`${m[1]}/${m[2]}/${m[3]}`));
	const times = [...t.replace(DATE_RE, ' ').matchAll(/(\d{1,2})\s*[:hH]\s*(\d{2})/g)].map(
		(m) => `${pad2(+m[1])}:${m[2]}`,
	);
	if (!dates.length || dates.some((d) => !d) || dates.length > 2)
		return {
			error: `thời gian giảng "${t}" không hợp lệ — ghi "Từ ngày dd/mm/yyyy đến ngày dd/mm/yyyy".`,
		};
	const [from, to = from] = dates;
	if (to < from) return { error: `thời gian giảng "${t}": ngày kết thúc trước ngày bắt đầu.` };
	if (times.some((x) => x > '23:59')) return { error: `giờ trong "${t}" không hợp lệ.` };
	return { from, to, start: times[0] || null };
};

// Ô ngày thật của Excel (Date) ⇒ 1 ngày; còn lại đọc theo chữ
const parseTimeCell = (cell, text) => {
	let v = cell?.value;
	if (v && typeof v === 'object' && !(v instanceof Date) && 'result' in v) v = v.result;
	if (v instanceof Date && !Number.isNaN(v.getTime())) {
		const d = ymdUtc(v);
		return { from: d, to: d, start: null };
	}
	return parseTimeText(text);
};

const parseWorkbook = async (buffer) => {
	const { cols, rows } = await readSheet(buffer, {
		matchers: MATCHERS,
		isValid: (c) => !!((c.code || c.title) && c.kind && (c.main || c.main_code)),
		headerError:
			'Không tìm thấy dòng tiêu đề — cần cột "Mã bài" / "Nội dung bài giảng", "Số tiết" (LT/TH) và "Giảng viên". Hãy dùng file mẫu.',
		isEmpty: (get, row) => ![...PEOPLE, 'kind', 'time', 'code', 'title'].some((f) => get(row, f)),
		isStop: isLecturerTotalsRow,
	});
	const out = [];
	let prev = { code: '', title: '' };
	for (const { r, row, get } of rows) {
		// Khối bài gộp ô: exceljs trả giá trị ô gốc cho ô bị gộp; không gộp ⇒ lấy bài dòng trên
		const code = cleanCode(get(row, 'code'));
		const title = get(row, 'title');
		if (code || title) prev = { code, title };
		const timeCell = cols.time ? row.getCell(cols.time) : null;
		const timeText = timeCell ? cellText(timeCell) : '';
		out.push({
			r,
			code: prev.code,
			title: prev.title,
			kind_text: get(row, 'kind'),
			kind: parseKind(get(row, 'kind')),
			main_code: tidy(get(row, 'main_code')),
			main: tidy(get(row, 'main')),
			asst_code: tidy(get(row, 'asst_code')),
			asst: tidy(get(row, 'asst')),
			time_text: timeText,
			time: timeCell ? parseTimeCell(timeCell, timeText) : {},
		});
	}
	return out;
};

const groupBy = (items, keyOf) => {
	const map = new Map();
	for (const item of items) {
		const key = keyOf(item);
		if (!map.has(key)) map.set(key, []);
		map.get(key).push(item);
	}
	return map;
};

// Cột DATE đọc về là Date hoặc chuỗi → 'YYYY-MM-DD'
const ymdOf = (v) =>
	!v ? '' : typeof v === 'string' ? v.slice(0, 10) : parseDateText(fmtDateVN(v)) || '';
const hm = (v) => (v ? String(v).slice(0, 5) : '');
// Loại buổi thực tế: chưa ghi ⇒ LT (cùng quy ước gradebookService.SESSION_KIND_SQL)
const kindOfSession = (s) => s.session_kind || 'theory';
const NO_CODE = new Set(['x', 'khong']);
// Ô mã của người không có mã: "-", "—", "x", "không"
const isNoCode = (c) => !/[\p{L}\d]/u.test(c) || NO_CODE.has(norm(c));
const sessionLabel = (s) =>
	`${fmtDateVN(ymdOf(s.session_date))}${s.start_time ? ` ${hm(s.start_time)}` : ''}`;
const rangeLabel = (from, to) =>
	from === to ? `ngày ${fmtDateVN(from)}` : `khoảng ${fmtDateVN(from)}–${fmtDateVN(to)}`;

const loadLookups = async (courseId) => {
	const pool = await getPool();
	const course = (
		await pool
			.request()
			.input('id', sql.VarChar(20), courseId)
			.query('SELECT id, name, start_date, end_date FROM courses WHERE id = @id')
	).recordset[0];
	if (!course) throw httpError(404, 'Không tìm thấy khóa học.');
	const [lessons, candidates, sessions, catalog, staff] = await Promise.all([
		lecturerAssignmentService.listCourseLessons(courseId),
		lecturerAssignmentService.listLecturerCandidates(courseId),
		classSessionService.listSessions(courseId),
		pool.request().query(`
      SELECT l.id, l.full_name, l.is_active, l.user_id, u.staff_number
      FROM lecturers l LEFT JOIN users u ON u.id = l.user_id`),
		// Nhân sự có mã NV — tìm giảng viên theo mã; kèm cờ có CCHN (tự tạo hồ sơ GV)
		pool.request().query(`
      SELECT u.id, u.full_name, u.staff_number, u.is_active,
             CASE WHEN EXISTS (SELECT 1 FROM staff_practice_licenses sl
                               WHERE sl.user_id = u.id AND sl.license_no IS NOT NULL)
                  THEN 1 ELSE 0 END AS has_license
      FROM users u WHERE u.staff_number IS NOT NULL`),
	]);
	return {
		course,
		lessons,
		candidates,
		sessions,
		lecturers: catalog.recordset,
		staff: staff.recordset,
	};
};

/**
 * Ô mã NV + ô họ tên → [{ code, name }] ghép theo thứ tự; mã "-" = người không có mã.
 * Cả 2 ô đều có mà số lượng khác nhau ⇒ { error }.
 */
const pairPeople = (codeText, nameText, label) => {
	const codes = splitStaffCell(codeText).map((c) => (isNoCode(c) ? '' : c));
	const names = splitLecturerCell(nameText);
	if (codes.length && names.length && codes.length !== names.length)
		return {
			error: `${label}: ${codes.length} mã NV nhưng ${names.length} họ tên — ghi mã cùng thứ tự với họ tên, người không có mã ghi dấu -.`,
		};
	const n = Math.max(codes.length, names.length);
	return {
		people: Array.from({ length: n }, (_, i) => ({ code: codes[i] || '', name: names[i] || '' })),
	};
};

const buildPreview = (rows, lookups) => {
	const warnings = [];
	const resolveByName = createLecturerResolver(lookups);
	const resolveByStaff = createStaffResolver(lookups);
	const byCode = new Map(lookups.lessons.filter((l) => l.code).map((l) => [cleanCode(l.code), l]));
	const byTitle = groupBy(lookups.lessons, (l) => norm(l.title));
	const sessionsOf = groupBy(lookups.sessions, (s) => s.subject_id || '');
	const claimed = new Map(); // session_id → dòng đã nhận buổi đó
	const items = [];

	const resolvePerson = ({ code, name }) => {
		if (code) {
			const num = parseStaffNumber(code);
			if (!num) return { error: `mã nhân viên "${code}" không hợp lệ` };
			return resolveByStaff(num, name);
		}
		const found = resolveByName(name);
		return found.error ? { error: `giảng viên "${name}" ${found.error}` } : found;
	};
	const pub = (p) => ({ name: p.name, staff_number: p.staff_number ?? null, is_new: !!p.is_new });

	const readRow = (row, base) => {
		if (!PEOPLE.some((f) => row[f])) return null; // dòng chưa phân công ⇒ giữ nguyên
		const label = [row.code, row.title].filter(Boolean).join(' · ');
		let lesson = row.code ? byCode.get(row.code) : null;
		if (!lesson && row.title) {
			const same = byTitle.get(norm(row.title)) || [];
			if (same.length > 1)
				return {
					note: `tên bài "${row.title}" trùng ${same.length} bài của khóa — ghi thêm mã bài.`,
				};
			[lesson] = same;
		}
		if (!lesson)
			return { note: label ? `bài "${label}" không thuộc khóa.` : 'thiếu mã / tên bài.' };
		Object.assign(base, { code: lesson.code || null, title: lesson.title });
		if (!row.kind)
			return {
				note:
					row.kind === null
						? `cột Số tiết ghi "${row.kind_text}" — cần LT hoặc TH.`
						: 'chưa ghi LT / TH ở cột Số tiết.',
			};
		if (row.time.error) return { note: row.time.error };
		const { from = null, to = null, start = null } = row.time;
		Object.assign(base, { from, to, start });

		const mains = pairPeople(row.main_code, row.main, 'Giảng viên chính');
		const assts = pairPeople(row.asst_code, row.asst, 'Trợ giảng');
		if (mains.error || assts.error) return { note: mains.error || assts.error };
		if (mains.people.length > 1)
			return { note: 'mỗi dòng 1 giảng viên chính — người còn lại ghi sang cột Trợ giảng.' };
		if (!mains.people.length) return { note: 'có trợ giảng nhưng thiếu giảng viên chính.' };
		const main = resolvePerson(mains.people[0]);
		const helpers = assts.people.map(resolvePerson);
		const failed = [main, ...helpers].filter((p) => p.error);
		if (failed.length) return { note: `${failed.map((p) => p.error).join('; ')}.` };
		const assistants = helpers.filter(
			(p, i) => p.id !== main.id && helpers.findIndex((q) => q.id === p.id) === i,
		);
		Object.assign(base, { main: pub(main), assistants: assistants.map(pub) });

		const kindText = row.kind === 'theory' ? 'LT' : 'TH';
		const matched = (sessionsOf.get(lesson.id) || []).filter((s) => {
			const d = ymdOf(s.session_date);
			return (
				kindOfSession(s) === row.kind &&
				(!from || (d >= from && d <= to)) &&
				(!start || hm(s.start_time) === start)
			);
		});
		if (!matched.length)
			return {
				note: `bài "${label}" chưa có buổi ${kindText} nào${from ? ` trong ${rangeLabel(from, to)}` : ''}${start ? ` lúc ${start}` : ''} — xếp buổi học trước rồi nhập lại.`,
			};
		const taken = matched.find((s) => claimed.has(s.id));
		if (taken)
			return {
				note: `buổi ${kindText} ${sessionLabel(taken)} đã thuộc dòng ${claimed.get(taken.id)} — tách khoảng ngày (hoặc ghi kèm giờ bắt đầu) để mỗi buổi chỉ thuộc 1 dòng.`,
			};
		const wantIds = assistants.map((p) => p.id).sort();
		const changes = [];
		for (const s of matched) {
			claimed.set(s.id, row.r);
			const haveIds = (s.assistants || []).map((a) => a.id).sort();
			if ((s.lecturer_id || '') !== main.id || haveIds.join(',') !== wantIds.join(','))
				changes.push({ session_id: s.id, lecturer_id: main.id, assistant_ids: wantIds });
		}
		return { matched, changes };
	};

	for (const row of rows) {
		const base = { row: row.r, code: row.code || null, title: row.title, kind: row.kind || null };
		const out = readRow(row, base);
		if (!out) continue;
		if (out.note) {
			warnings.push(`Dòng ${row.r}: ${out.note}`);
			items.push({ ...base, status: 'skipped', note: out.note });
			continue;
		}
		items.push({
			...base,
			status: out.changes.length ? 'update' : 'unchanged',
			sessions: out.matched.length,
			changed: out.changes.length,
			dates: out.matched.map(sessionLabel),
			changes: out.changes,
		});
	}
	return { items, warnings };
};

const summarize = (items) => ({
	rows: items.length,
	update: items.filter((i) => i.status === 'update').length,
	unchanged: items.filter((i) => i.status === 'unchanged').length,
	skipped: items.filter((i) => i.status === 'skipped').length,
	sessions: items.reduce((n, i) => n + (i.changed || 0), 0),
});

// Bản gửi về giao diện: bỏ `changes` (mã giảng viên nội bộ để ghi)
const publicItem = ({ changes: _changes, ...rest }) => rest;

const commit = async (items, actorId) => {
	const warnings = [];
	let updated = 0;
	for (const item of items) {
		for (const c of item.changes || []) {
			try {
				const out = await classSessionService.updateSession(
					c.session_id,
					{ lecturer_id: c.lecturer_id, assistant_ids: c.assistant_ids },
					actorId,
				);
				updated += 1;
				warnings.push(...(out.warnings || []));
			} catch (err) {
				if (!err.statusCode) throw err;
				item.status = 'failed';
				item.note = err.message;
				warnings.push(`Dòng ${item.row}: ${err.message}`);
				break; // lỗi theo người (vd. đang là học viên của khóa) ⇒ buổi khác của dòng cũng lỗi
			}
		}
	}
	return { updated, warnings: [...new Set(warnings)] };
};

const importExcel = async ({ courseId, buffer, dry_run }, actorId) => {
	const rows = await parseWorkbook(buffer);
	if (!rows.length) throw badRequest('File không có dòng bài học nào.');
	const lookups = await loadLookups(courseId);
	const preview = buildPreview(rows, lookups);
	if (dry_run)
		return {
			dry_run: true,
			summary: summarize(preview.items),
			rows: preview.items.map(publicItem),
			warnings: preview.warnings,
		};
	const done = await commit(preview.items, actorId);
	return {
		dry_run: false,
		summary: { ...summarize(preview.items), updated_sessions: done.updated },
		rows: preview.items.map(publicItem),
		warnings: [...preview.warnings, ...done.warnings],
	};
};

module.exports = {
	importExcel,
	parseWorkbook,
	buildPreview,
	parseTimeText,
	parseKind,
	loadLookups,
	ymdOf,
	hm,
	kindOfSession,
	groupBy,
};
