/**
 * programLessonLecturerImportService.js — Nhập giảng viên giảng dạy từng bài học
 * của 1 chương trình đào tạo từ Excel (tab "Bài học" của chương trình).
 *
 * File: mỗi dòng 1 bài học — Mã bài học | Tên bài học | Số tiết (chỉ để xem) | Giảng viên
 * (file cũ: "Giảng viên chính") | Giảng viên phụ (nhiều người cách nhau bằng dấu ; , hoặc
 * xuống dòng). "Tải file mẫu" điền sẵn các bài của chương trình, giảng viên đang gán và
 * khối "Tổng số tiết theo giảng viên" dưới bảng (nhập lại thì dừng đọc ở khối này).
 *
 * Quy tắc:
 *  - Bài khớp theo MÃ, không có mã thì theo tên (chỉ trong các bài của chương trình;
 *    vòng thực hành GPHN không gán giảng viên ở đây).
 *  - Mỗi dòng đặt LẠI giảng viên của bài đúng như trong file (ô trống = gỡ). Bài
 *    không có trong file thì giữ nguyên.
 *  - Tên giảng viên bỏ học hàm / học vị ở đầu ("ThS.BS Nguyễn Văn A") rồi khớp danh
 *    mục Giảng viên theo họ tên. Chưa có thì tạo mới: khớp nhân sự theo họ tên (ưu
 *    tiên khoa của chương trình) để gắn tài khoản; không khớp / trùng tên thì tạo
 *    giảng viên chưa gắn tài khoản. Cần quyền lecturers:create — thiếu thì bỏ qua dòng.
 *  - Dòng có tên không xác định được (trùng tên nhiều giảng viên, giảng viên đã ngừng
 *    hoạt động) bị bỏ qua cả dòng, không đụng tới giảng viên đang gán của bài.
 * dry_run trả bản xem trước, không ghi DB.
 */
const { lazyRequire } = require('../../../utils/lazyRequire');
/** @type {typeof import('exceljs')} */
const ExcelJS = lazyRequire('exceljs');
const { getPool, sql } = require('../../../config/db');
const { norm } = require('../../../utils/vietnameseText');
const { readSheet } = require('../../../utils/excelImport');
const {
	addLecturerTotals,
	fmtHours,
	isLecturerTotalsRow,
} = require('../../../utils/excelLecturerTotals');
const { badRequest, httpError } = require('../../../utils/httpError');
const { broadcast } = require('../../events/eventService');
const { ROLE, roleIdOf } = require('../../access/roleCodes');
const lecturerService = require('../lecturers/lecturerService');
const lessonService = require('./programLessonService');
const { lecturerCreditFactor } = require('../courses/courseCmeService');

const MATCHERS = [
	['code', (h) => h === 'ma bai hoc' || h === 'ma bai' || h === 'ma'],
	['title', (h) => h === 'ten bai hoc' || h === 'ten bai' || h === 'bai hoc' || h === 'noi dung'],
	['main', (h) => h.startsWith('giang vien chinh') || h === 'gv chinh' || h === 'giang vien'],
	[
		'assistants',
		(h) => h.startsWith('giang vien phu') || h.startsWith('gv phu') || h.startsWith('tro giang'),
	],
];

const HEADERS = {
	code: 'Mã bài học',
	title: 'Tên bài học',
	hours: 'Số tiết',
	// Cột người dạy chính ghi "Giảng viên"; file cũ ghi "Giảng viên chính" vẫn đọc được (MATCHERS)
	main: 'Giảng viên',
	assistants: 'Giảng viên phụ (nhiều người cách nhau bằng dấu ;)',
};

// Học hàm / học vị / chức danh hay ghi trước tên ("PGS.TS", "BSCKII", "ThS.BS", "ĐD").
const TITLE_TOKENS = new Set(
	'gs pgs ts tskh ths bs bsnt bsck bscki bsckii bsck1 bsck2 ck cki ckii ck1 ck2 ds dsck dscki dsckii dd ddt cn cnd ktv ks dr'.split(
		' ',
	),
);
// "CK I", "BSCK 2": cấp chuyên khoa viết rời sau ck / bsck / dsck
const LEVEL_TOKENS = new Set(['i', 'ii', '1', '2']);
const TAKES_LEVEL = new Set(['ck', 'bsck', 'dsck']);

const cleanCode = (s) =>
	String(s || '')
		.replace(/\s+/g, '')
		.toUpperCase();
const tidy = (s) =>
	String(s || '')
		.replace(/\s+/g, ' ')
		.trim();

/** "ThS.BS Nguyễn Văn A" → { degree: 'ThS.BS', name: 'Nguyễn Văn A' }. Không có học vị → degree null. */
const splitTitle = (raw) => {
	const text = tidy(raw);
	let rest = text;
	let prev = '';
	for (;;) {
		const m = rest.match(/^([\p{L}\d]+)[.\s]+/u);
		if (!m) break;
		const token = norm(m[1]);
		const isTitle = TITLE_TOKENS.has(token) || (LEVEL_TOKENS.has(token) && TAKES_LEVEL.has(prev));
		if (!isTitle) break;
		prev = token;
		rest = rest.slice(m[0].length);
	}
	// Tên người ít nhất 2 từ — tránh cắt nhầm khi cả ô chỉ là chữ viết tắt
	if (rest === text || norm(rest).split(' ').length < 2) return { degree: null, name: text };
	const degree = tidy(text.slice(0, text.length - rest.length)).replace(/[.\s]+$/, '');
	return { degree: degree.slice(0, 50) || null, name: rest };
};

// Ô giảng viên → danh sách tên (tách ; , xuống dòng), bỏ trùng theo họ tên.
const splitNames = (raw) => {
	const seen = new Set();
	const out = [];
	for (const part of String(raw || '').split(/[;,\n]+/)) {
		const person = splitTitle(part);
		const key = norm(person.name);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push(person);
	}
	return out;
};

// Giữ xuống dòng trong ô (cellText gộp mọi khoảng trắng) để tách nhiều giảng viên.
const rawCellText = (cell) => {
	try {
		return String(cell?.text ?? '');
	} catch {
		return '';
	}
};

const parseWorkbook = async (buffer) => {
	const { cols, rows } = await readSheet(buffer, {
		matchers: MATCHERS,
		isValid: (c) => !!((c.code || c.title) && (c.main || c.assistants)),
		headerError:
			'Không tìm thấy dòng tiêu đề — cần cột "Mã bài học" hoặc "Tên bài học" và cột "Giảng viên" / "Giảng viên phụ".',
		isEmpty: (get, row) => !['code', 'title', 'main', 'assistants'].some((f) => get(row, f)),
		isStop: isLecturerTotalsRow,
	});
	const raw = (row, f) => (cols[f] ? rawCellText(row.getCell(cols[f])) : '');
	return rows.map(({ r, row, get }) => ({
		r,
		code: cleanCode(get(row, 'code')),
		title: get(row, 'title'),
		main: splitNames(raw(row, 'main')),
		assistants: splitNames(raw(row, 'assistants')),
	}));
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

const loadProgram = async (programId) => {
	const pool = await getPool();
	const program = (
		await pool
			.request()
			.input('id', sql.VarChar(20), programId)
			.query('SELECT id, code, name, department_id FROM training_programs WHERE id = @id')
	).recordset[0];
	if (!program) throw httpError(404, 'Không tìm thấy chương trình đào tạo.');
	return program;
};

const loadLookups = async (programId) => {
	const pool = await getPool();
	const program = await loadProgram(programId);
	const traineeRoleId = await roleIdOf(ROLE.TRAINEE);
	const [lessons, lecturers, users] = await Promise.all([
		lessonService.listLessons(programId),
		pool.request().query(`
      SELECT l.id, l.user_id, l.full_name, l.is_active, u.department_id
      FROM lecturers l LEFT JOIN users u ON u.id = l.user_id`),
		pool.request().query(`
      SELECT id, full_name, department_id, role_id, is_active, email, phone_number, date_of_birth, gender
      FROM users`),
	]);
	return {
		program,
		lessons,
		lecturers: lecturers.recordset,
		// Tài khoản học viên không làm giảng viên được (lecturerService.assertNotTraineeAccount)
		users: users.recordset.filter((u) => !traineeRoleId || u.role_id !== traineeRoleId),
	};
};

const createPersonResolver = ({ program, lecturers, users }, canCreateLecturer) => {
	// Họ tên trong danh mục / tài khoản có thể ghi kèm học vị ("GS.TS. Nguyễn Văn A") — so theo phần tên
	const nameKey = (fullName) => norm(splitTitle(fullName).name);
	const lecturersByName = groupBy(lecturers, (l) => nameKey(l.full_name));
	const lecturerByUser = new Map(lecturers.filter((l) => l.user_id).map((l) => [l.user_id, l]));
	const usersByName = groupBy(users, (u) => nameKey(u.full_name));
	const inProgramDept = (x) => !!program.department_id && x.department_id === program.department_id;
	const cache = new Map();

	const existing = (l, person) => ({
		...person,
		status: 'existing',
		lecturer_id: l.id,
		full_name: l.full_name,
	});

	const resolve = (person) => {
		const key = norm(person.name);
		const sameName = lecturersByName.get(key) || [];
		const active = sameName.filter((l) => l.is_active);
		if (active.length === 1) return existing(active[0], person);
		if (active.length > 1) {
			const inDept = active.filter(inProgramDept);
			if (inDept.length === 1) return existing(inDept[0], person);
			return {
				...person,
				status: 'error',
				note: `trùng tên ${active.length} giảng viên trong danh mục`,
			};
		}
		if (sameName.length)
			return { ...person, status: 'error', note: 'giảng viên đã ngừng hoạt động' };

		// Chưa có trong danh mục Giảng viên → tìm nhân sự cùng họ tên để gắn tài khoản
		const candidates = usersByName.get(key) || [];
		const pickActive = (list) => (list.length > 1 ? list.filter((u) => u.is_active) : list);
		const inDept = pickActive(candidates.filter(inProgramDept));
		const anywhere = pickActive(candidates);
		let user = null;
		let note = 'không có trong nhân sự — tạo giảng viên chưa gắn tài khoản';
		if (inDept.length === 1) [user] = inDept;
		else if (inDept.length > 1)
			note = `trùng tên ${inDept.length} nhân sự cùng khoa — tạo giảng viên chưa gắn tài khoản`;
		else if (anywhere.length === 1) [user] = anywhere;
		else if (candidates.length > 1)
			note = `trùng tên ${candidates.length} nhân sự — tạo giảng viên chưa gắn tài khoản`;

		// Nhân sự đó đã là giảng viên (hồ sơ giảng viên ghi tên khác) → dùng luôn
		const linked = user && lecturerByUser.get(user.id);
		if (linked) {
			if (!linked.is_active)
				return { ...person, status: 'error', note: 'giảng viên đã ngừng hoạt động' };
			return existing(linked, person);
		}
		if (!canCreateLecturer)
			return {
				...person,
				status: 'error',
				note: 'chưa có trong danh mục Giảng viên — cần quyền thêm giảng viên',
			};
		return { ...person, status: 'new', user, note: user ? null : note };
	};

	return (person) => {
		const key = norm(person.name);
		if (!cache.has(key)) cache.set(key, resolve(person));
		return cache.get(key);
	};
};

const personLabel = (p) => p.full_name || p.name;
// Cùng 1 người (đã có → theo mã giảng viên; sắp tạo → theo họ tên)
const personKey = (p) => p.lecturer_id || `new:${norm(p.name)}`;

const buildPreview = (rows, lookups, { canCreateLecturer = false } = {}) => {
	const warnings = [];
	const resolvePerson = createPersonResolver(lookups, canCreateLecturer);
	const lessons = lookups.lessons.filter((l) => l.lesson_kind !== 'rotation');
	const rotationCodes = new Set(
		lookups.lessons
			.filter((l) => l.lesson_kind === 'rotation' && l.code)
			.map((l) => cleanCode(l.code)),
	);
	const byCode = new Map(lessons.filter((l) => l.code).map((l) => [cleanCode(l.code), l]));
	const byTitle = groupBy(lessons, (l) => norm(l.title));

	const items = [];
	const seenLessons = new Set();
	for (const row of rows) {
		const warn = (msg) => warnings.push(`Dòng ${row.r}: ${msg}`);
		const label = [row.code, row.title].filter(Boolean).join(' · ');

		let lesson = row.code ? byCode.get(row.code) : null;
		if (!lesson && row.title) {
			const sameTitle = byTitle.get(norm(row.title)) || [];
			if (sameTitle.length > 1) {
				warn(
					`tên bài "${row.title}" trùng ${sameTitle.length} bài của chương trình — ghi thêm mã bài học.`,
				);
				continue;
			}
			[lesson] = sameTitle;
		}
		if (!lesson) {
			warn(
				row.code && rotationCodes.has(row.code)
					? `"${label}" là vòng thực hành — không gán giảng viên ở đây, bỏ qua.`
					: `bài "${label}" không thuộc chương trình — bỏ qua.`,
			);
			continue;
		}
		if (seenLessons.has(lesson.lesson_id)) {
			warn(`bài "${label}" lặp lại trong file — bỏ qua dòng này.`);
			continue;
		}
		seenLessons.add(lesson.lesson_id);

		// Ô "Giảng viên chính" ghi nhiều người: người đầu là chính, còn lại sang phụ
		const [mainRaw, ...extra] = row.main;
		if (extra.length)
			warn(
				`ô giảng viên chính có ${row.main.length} người — lấy "${mainRaw.name}" làm chính, còn lại là giảng viên phụ.`,
			);
		const main = mainRaw ? resolvePerson(mainRaw) : null;
		const assistants = [];
		for (const raw of [...extra, ...row.assistants]) {
			const person = resolvePerson(raw);
			const same = (other) => other && personKey(other) === personKey(person);
			if (person.status !== 'error' && (same(main) || assistants.some(same))) continue;
			assistants.push(person);
		}

		const current = lesson.lecturers || [];
		const item = {
			row: row.r,
			lesson_id: lesson.lesson_id,
			code: lesson.code || null,
			title: lesson.title,
			main,
			assistants,
			current_count: current.length,
		};
		const people = [main, ...assistants].filter(Boolean);
		const failed = people.filter((p) => p.status === 'error');
		if (failed.length) {
			item.status = 'skipped';
			warn(`bài "${label}" bỏ qua — ${failed.map((p) => `${p.name}: ${p.note}`).join('; ')}.`);
		} else if (!people.length) {
			item.status = current.length ? 'clear' : 'unchanged';
			if (current.length)
				warn(`bài "${label}" để trống giảng viên — sẽ gỡ ${current.length} giảng viên đang gán.`);
		} else {
			const wanted = people.map((p) => `${p === main ? 'main' : 'assistant'}:${personKey(p)}`);
			const now = current.map((c) => `${c.role}:${c.lecturer_id}`);
			const same = wanted.length === now.length && wanted.every((k) => now.includes(k));
			item.status = same ? 'unchanged' : 'set';
		}
		items.push(item);
	}

	// Giảng viên sắp tạo (mỗi người 1 lần) — chỉ tính ở dòng sẽ ghi
	const newPeople = new Map();
	for (const item of items) {
		if (item.status !== 'set') continue;
		for (const p of [item.main, ...item.assistants])
			if (p?.status === 'new') newPeople.set(personKey(p), p);
	}
	for (const p of newPeople.values())
		if (p.note) warnings.push(`Giảng viên mới "${personLabel(p)}": ${p.note}.`);

	return { items, newPeople: [...newPeople.values()], warnings };
};

const summarize = ({ items, newPeople }) => ({
	lessons_total: items.length,
	lessons_set: items.filter((i) => i.status === 'set').length,
	lessons_cleared: items.filter((i) => i.status === 'clear').length,
	lessons_unchanged: items.filter((i) => i.status === 'unchanged').length,
	lessons_skipped: items.filter((i) => i.status === 'skipped').length,
	lecturers_new: newPeople.length,
	lecturers_linked: newPeople.filter((p) => p.user).length,
});

// Bản gửi về giao diện: không kèm dữ liệu nhân sự (email, điện thoại…) dùng để tạo giảng viên.
const publicPerson = (p) =>
	p && {
		name: personLabel(p),
		degree: p.degree,
		status: p.status,
		has_account: p.status === 'new' ? !!p.user : undefined,
		note: p.note || null,
	};
const publicItem = (i) => ({
	...i,
	main: publicPerson(i.main),
	assistants: i.assistants.map(publicPerson),
});

const createLecturer = async (person, actorId) => {
	const u = person.user;
	// Email giữ chỗ (*.local) của tài khoản tạo tự động không phải email thật
	const email = u?.email && !/\.local$/i.test(u.email) && u.email.length <= 100 ? u.email : null;
	const created = await lecturerService.create(
		{
			user_id: u?.id || null,
			full_name: (u?.full_name || person.name).slice(0, 150),
			is_external: false,
			phone: u?.phone_number || null,
			email,
			academic_degree: person.degree,
			dob: u?.date_of_birth || null,
			gender: u?.gender || null,
		},
		actorId,
	);
	return created.id;
};

const commit = async (programId, preview, actorId) => {
	const newIds = new Map();
	for (const person of preview.newPeople)
		newIds.set(personKey(person), await createLecturer(person, actorId));
	const idOf = (p) => p.lecturer_id || newIds.get(personKey(p));

	for (const item of preview.items) {
		if (item.status !== 'set' && item.status !== 'clear') continue;
		await lessonService.setLessonLecturers(
			programId,
			item.lesson_id,
			{ main: item.main ? idOf(item.main) : null, assistants: item.assistants.map(idOf) },
			actorId,
		);
	}
	broadcast('update', { entity: 'program_lesson' });
	return { lecturers_created: newIds.size };
};

// canCreateLecturer = actor có lecturers:create (controller truyền vào). Mặc định false:
// thiếu cờ thì chỉ gán giảng viên đã có trong danh mục.
const importExcel = async ({ programId, buffer, dry_run, canCreateLecturer = false }, actorId) => {
	const rows = await parseWorkbook(buffer);
	if (!rows.length) throw badRequest('File không có dòng bài học nào.');
	const lookups = await loadLookups(programId);
	const preview = buildPreview(rows, lookups, { canCreateLecturer });
	const out = {
		summary: summarize(preview),
		lessons: preview.items.map(publicItem),
		warnings: preview.warnings,
	};
	if (dry_run) return { dry_run: true, ...out };
	return { dry_run: false, ...out, ...(await commit(programId, preview, actorId)) };
};

// File mẫu: các bài (không tính vòng thực hành) của chương trình + giảng viên đang gán,
// dưới bảng là khối công thức tổng số tiết từng giảng viên (tự tính khi sửa bảng — nhập lại thì
// bỏ qua khối này, xem excelLecturerTotals).
const buildTemplate = async (programId) => {
	const program = await loadProgram(programId);
	const lessons = (await lessonService.listLessons(programId)).filter(
		(l) => l.lesson_kind !== 'rotation',
	);
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('Giảng viên');
	ws.columns = [
		{ width: 6 },
		{ width: 18 },
		{ width: 52 },
		{ width: 9 },
		{ width: 30 },
		{ width: 46 },
	];
	ws.addRow([
		`Giảng viên giảng dạy — ${[program.code, program.name].filter(Boolean).join(' · ')}`,
	]).font = { bold: true, size: 13 };
	ws.addRow([
		'Mỗi dòng 1 bài học. Ghi họ tên giảng viên (có thể kèm học vị: "ThS.BS Nguyễn Văn A"); nhiều giảng viên phụ cách nhau bằng dấu ; . Ô trống = bài không có giảng viên. Không đổi mã bài học.',
	]).font = { italic: true, color: { argb: 'FF526574' } };
	ws.mergeCells('A1:F1');
	ws.mergeCells('A2:F2');
	ws.getRow(2).alignment = { wrapText: true, vertical: 'top' };
	ws.getRow(2).height = 32;
	ws.addRow([]);
	const header = ws.addRow([
		'STT',
		HEADERS.code,
		HEADERS.title,
		HEADERS.hours,
		HEADERS.main,
		HEADERS.assistants,
	]);
	header.font = { bold: true };
	header.alignment = { vertical: 'middle', wrapText: true };
	header.eachCell((cell) => {
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F3EC' } };
		cell.border = { bottom: { style: 'thin', color: { argb: 'FF9DB5A6' } } };
	});
	// Chỉ ghi họ tên (không kèm học vị): nhập lại file phải khớp đúng giảng viên đang gán
	const nameOf = (l) => l.full_name;
	lessons.forEach((l, i) => {
		const people = l.lecturers || [];
		const row = ws.addRow([
			i + 1,
			l.code || '',
			l.title,
			Number(l.total_hours) || 0,
			people
				.filter((p) => p.role === 'main')
				.map(nameOf)
				.join('; '),
			people
				.filter((p) => p.role !== 'main')
				.map(nameOf)
				.join('; '),
		]);
		row.alignment = { vertical: 'top', wrapText: true };
	});
	const factor = await lecturerCreditFactor();
	addLecturerTotals(wb, ws, {
		firstRow: 5,
		cols: { hours: 'D', main: 'E', assistants: 'F' },
		lastCol: 'F',
		block: { name: ['B', 'C'], hours: ['D'], credits: 'E' },
		// Chương trình chưa có buổi dạy ⇒ quy tắc CME của bài chưa có buổi: GV chính đủ số tiết, GV phụ 0
		cme: { mode: 'main', factor },
		creditLabel: 'Giờ tín chỉ CME dự kiến',
		note: `tự tính theo bảng trên: gõ / sửa tên ở cột Giảng viên, Giảng viên phụ (nhiều người cách nhau dấu ;) hoặc số tiết thì tổng cập nhật ngay. Tổng số tiết tính riêng từng người (chính hay phụ đều đủ số tiết bài). Giờ tín chỉ CME dự kiến khi bài chưa có buổi dạy: giảng viên được đủ số tiết bài, giảng viên phụ 0, × ${fmtHours(factor)} (Thông tư 32/2023/TT-BYT); số ghi thật tính theo các buổi đã dạy của từng khóa.`,
	});
	ws.views = [{ state: 'frozen', ySplit: 4 }];
	// Tên file theo tên chương trình (giao diện đặt lại tên có dấu khi lưu)
	const slug = norm(program.name || program.code).replace(/\s+/g, '-') || 'chuong-trinh';
	return { workbook: wb, fileName: `giang-vien-bai-hoc_${slug}.xlsx` };
};

module.exports = {
	importExcel,
	buildTemplate,
	parseWorkbook,
	buildPreview,
	splitTitle,
	splitNames,
};
