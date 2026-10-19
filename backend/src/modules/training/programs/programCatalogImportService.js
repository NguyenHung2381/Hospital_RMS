/**
 * programCatalogImportService.js — Nhập danh mục chương trình đào tạo + vòng
 * thực hành từ file Excel của phòng Đào tạo (mẫu 1.xlsx):
 *   - Sheet "Mã CT": mỗi dòng 1 chương trình (ĐTLT_1…, GPHN_BS_1…).
 *   - Sheet "Bài học": dòng có mã GPHN_* = mở chương trình; dòng có mã khác
 *     (TH_BS_HSCC…) = 1 vòng thuộc chương trình đang mở; dòng không mã chỉ có
 *     nội dung = 1 khoa được chọn của vòng ngay trên.
 * Cập nhật theo MÃ (chương trình: training_programs.code, vòng:
 * program_lessons.code) nên nhập lại nhiều lần an toàn. Ô trống trong file
 * không xoá dữ liệu đang có. dry_run trả bản xem trước, không ghi DB.
 */
const { getPool } = require('../../../config/db');
const { norm } = require('../../../utils/vietnameseText');
const { loadWorkbook, findHeader, cellText } = require('../../../utils/excelImport');
const { parseDuration, formatDuration, toDays } = require('../../../utils/trainingDuration');
const { createDepartmentMatcher } = require('../../../utils/departmentMatch');
const { badRequest } = require('../../../utils/httpError');
const programService = require('./trainingProgramService');

const PROGRAM_MATCHERS = [
	['code', (h) => h.startsWith('ma chuong trinh') || h === 'ma ct'],
	['name', (h) => h.startsWith('ten chuong trinh')],
	['theory_hours', (h) => h === 'ly thuyet'],
	['practice_hours', (h) => h === 'thuc hanh'],
	['credit_hours', (h) => h.includes('tin chi')],
	['duration', (h) => h === 'thoi luong' || h === 'thoi gian'],
	['target_audience', (h) => h.startsWith('doi tuong')],
	['tuition_fee', (h) => h === 'hoc phi'],
	['department', (h) => h.startsWith('khoa phu trach')],
];

const LESSON_MATCHERS = [
	['code', (h) => h === 'ma'],
	['title', (h) => h === 'noi dung' || h === 'ten bai hoc'],
	['duration', (h) => h === 'thoi gian' || h === 'thoi luong'],
];

// Tiền tố mã chương trình → loại hình (id seed ở 2026-11-07_training_course_types_rotations).
const TYPE_BY_PREFIX = [
	['dtlt', 'TRNTP-DTLT'],
	['gphn', 'TRNTP-GPHN'],
	['ctcv', 'TRNTP-CTCV'],
	['thbv', 'TRNTP-THBV'],
];

const cleanCode = (s) => String(s || '').replace(/\s+/g, '');
const intOrNull = (s) => (/^\d+$/.test(String(s).trim()) ? Number(s) : null);
// "1.500.000" / "1,5" / "3" → số; rỗng/chữ → null
const numOrNull = (s, { thousands = false } = {}) => {
	let t = String(s || '').trim();
	if (!t) return null;
	t = thousands ? t.replace(/[.,\s]/g, '') : t.replace(',', '.');
	const n = Number(t);
	return Number.isFinite(n) ? n : null;
};

// Ô "Khoa phụ trách" của GPHN là câu mô tả ("Nhiều khoa phụ trách tùy từng vòng…")
// chứ không phải tên khoa — giữ làm ghi chú, không báo lỗi.
const isDescriptiveDept = (raw) => /nhieu khoa|tuy vao|tuy tung|cac khoa/.test(norm(raw));

const sheetRows = (header, read) => {
	const { ws, headerRow } = header;
	const out = [];
	for (let r = headerRow + 1; r <= (ws.rowCount || headerRow); r++) {
		const row = ws.getRow(r);
		const item = read(row);
		if (item) out.push({ r, sheet: ws.name, ...item });
	}
	return out;
};

const parseWorkbook = async (buffer) => {
	const workbook = await loadWorkbook(buffer);
	const progHeader = findHeader(workbook, PROGRAM_MATCHERS, (c) => !!(c.code && c.name));
	if (!progHeader)
		throw badRequest(
			'Không tìm thấy sheet danh mục chương trình (cần cột "Mã Chương trình đào tạo" và "Tên Chương trình đào tạo").',
		);
	const lessonHeader = findHeader(
		workbook,
		LESSON_MATCHERS,
		(c) => !!(c.code && c.title && c.duration),
	);

	const pc = progHeader.cols;
	const cell = (cols) => (row, f) => (cols[f] ? cellText(row.getCell(cols[f])) : '');
	const pget = cell(pc);
	const programs = sheetRows(progHeader, (row) => {
		const code = cleanCode(pget(row, 'code'));
		const name = pget(row, 'name');
		if (!code || !name) return null;
		return {
			code,
			name,
			theory_hours: intOrNull(pget(row, 'theory_hours')),
			practice_hours: intOrNull(pget(row, 'practice_hours')),
			credit_hours: numOrNull(pget(row, 'credit_hours')),
			tuition_fee: numOrNull(pget(row, 'tuition_fee'), { thousands: true }),
			duration_raw: pget(row, 'duration'),
			target_audience: pget(row, 'target_audience') || null,
			department_raw: pget(row, 'department') || null,
		};
	});

	const lines = [];
	if (lessonHeader) {
		const lget = cell(lessonHeader.cols);
		lines.push(
			...sheetRows(lessonHeader, (row) => {
				const code = cleanCode(lget(row, 'code'));
				const title = lget(row, 'title');
				if (!code && !title) return null;
				return { code, title, duration_raw: lget(row, 'duration') };
			}),
		);
	}
	return { programs, lines, hasLessonSheet: !!lessonHeader };
};

const loadLookups = async () => {
	const pool = await getPool();
	const [depts, types, progs, lessons, links] = await Promise.all([
		pool.request().query('SELECT id, name FROM departments'),
		pool.request().query('SELECT id FROM training_types'),
		pool.request().query('SELECT id, code FROM training_programs WHERE code IS NOT NULL'),
		pool
			.request()
			.query("SELECT id, code FROM program_lessons WHERE code <> '' ORDER BY created_at"),
		pool.request().query('SELECT id, lesson_id, program_id FROM lesson_programs'),
	]);
	const lessonByCode = new Map();
	for (const l of lessons.recordset) if (!lessonByCode.has(l.code)) lessonByCode.set(l.code, l.id);
	return {
		matchDept: createDepartmentMatcher(depts.recordset),
		typeIds: new Set(types.recordset.map((t) => t.id)),
		programByCode: new Map(progs.recordset.map((p) => [p.code, p.id])),
		lessonByCode,
		linkByPair: new Map(links.recordset.map((l) => [`${l.program_id}|${l.lesson_id}`, l.id])),
	};
};

const matchDeptOrWarn = (raw, lookups, warn) => {
	const hit = lookups.matchDept(raw);
	if (hit?.id) return hit;
	if (hit?.ambiguous) warn(`"${raw}" khớp nhiều khoa (${hit.ambiguous.join(', ')}) — chưa gán.`);
	else warn(`Không khớp khoa "${raw}" trong danh mục khoa/phòng.`);
	return null;
};

const durationOf = (raw, warn) => {
	if (!raw) return { duration_value: null, duration_unit: null, duration: null };
	const d = parseDuration(raw);
	if (!d) {
		warn(`Thời lượng "${raw}" không đọc được — giữ dạng chữ.`);
		return { duration_value: null, duration_unit: null, duration: raw };
	}
	return {
		duration_value: d.value,
		duration_unit: d.unit,
		duration: formatDuration(d.value, d.unit),
	};
};

const buildPreview = ({ programs, lines }, lookups) => {
	const warnings = [];
	const at = (x) => (msg) => warnings.push(`${x.sheet} dòng ${x.r}: ${msg}`);

	const programItems = [];
	const seen = new Set();
	for (const p of programs) {
		const warn = at(p);
		if (seen.has(p.code)) {
			warn(`Mã "${p.code}" lặp lại — bỏ qua dòng này.`);
			continue;
		}
		seen.add(p.code);
		const prefix = TYPE_BY_PREFIX.find(([pre]) => norm(p.code).startsWith(pre));
		const typeId = prefix && lookups.typeIds.has(prefix[1]) ? prefix[1] : null;
		if (!typeId) warn(`Không xác định được loại hình từ mã "${p.code}".`);

		let department = null;
		let departmentNote = null;
		if (p.department_raw) {
			if (isDescriptiveDept(p.department_raw)) departmentNote = p.department_raw;
			else {
				department = matchDeptOrWarn(p.department_raw, lookups, warn);
				if (!department) departmentNote = p.department_raw;
			}
		}
		programItems.push({
			row: p.r,
			status: lookups.programByCode.has(p.code) ? 'update' : 'new',
			code: p.code,
			name: p.name,
			training_type_id: typeId,
			department_id: department?.id ?? null,
			department_name: department?.name ?? null,
			department_note: departmentNote,
			target_audience: p.target_audience,
			theory_hours: p.theory_hours,
			practice_hours: p.practice_hours,
			credit_hours: p.credit_hours,
			tuition_fee: p.tuition_fee,
			...durationOf(p.duration_raw, warn),
		});
	}

	const knownPrograms = new Set([...seen, ...lookups.programByCode.keys()]);
	const lessonItems = [];
	let program = null;
	let lesson = null;
	for (const line of lines) {
		const warn = at(line);
		if (line.code && knownPrograms.has(line.code)) {
			program = line.code;
			lesson = null;
			continue;
		}
		if (line.code) {
			if (!program) {
				warn(`Vòng "${line.code}" nằm trước mọi mã chương trình — bỏ qua.`);
				lesson = null;
				continue;
			}
			// "Thực hành vòng chuyên khoa lẻ (RHM, TMH, Mắt…)": khoa liệt kê trong ngoặc,
			// học viên chia thời gian vòng cho nhiều khoa.
			const inParens = line.title.match(/\(([^)]+)\)/)?.[1];
			const departments = [];
			for (const raw of inParens ? inParens.split(/[,;]/) : []) {
				const hit = matchDeptOrWarn(raw.trim(), lookups, warn);
				if (hit && !departments.some((d) => d.id === hit.id)) departments.push(hit);
			}
			lesson = {
				row: line.r,
				program_code: program,
				status: lookups.lessonByCode.has(line.code) ? 'update' : 'new',
				code: line.code,
				title: line.title,
				allow_split: !!inParens,
				departments,
				...durationOf(line.duration_raw, warn),
			};
			lessonItems.push(lesson);
			continue;
		}
		if (!lesson) {
			warn(`"${line.title}" không thuộc vòng nào — bỏ qua.`);
			continue;
		}
		const hit = matchDeptOrWarn(line.title, lookups, warn);
		if (hit && !lesson.departments.some((d) => d.id === hit.id)) lesson.departments.push(hit);
	}

	// Tổng thời lượng các vòng phải bằng thời lượng chương trình (BS_1: 3+1+2+2+2+2 = 12
	// tháng) — lệch thường do vòng bị xếp nhầm dưới chương trình khác trong sheet.
	for (const p of programItems) {
		const rotations = lessonItems.filter((l) => l.program_code === p.code);
		const programDays = toDays(p.duration_value, p.duration_unit);
		if (!rotations.length || !programDays) continue;
		const sumDays = rotations.reduce(
			(s, l) => s + (toDays(l.duration_value, l.duration_unit) ?? 0),
			0,
		);
		if (Math.abs(sumDays - programDays) > 1)
			warnings.push(
				`Chương trình ${p.code}: tổng thời lượng ${rotations.length} vòng ≈ ${Math.round((sumDays / 30) * 10) / 10} tháng, khác thời lượng chương trình (${p.duration}) — kiểm tra lại vòng nào thuộc chương trình nào.`,
			);
	}
	return { programItems, lessonItems, warnings };
};

// Chỉ ghi trường có giá trị trong file — ô trống không xoá dữ liệu đang có.
const pickFilled = (obj, fields) =>
	Object.fromEntries(fields.filter((f) => obj[f] != null && obj[f] !== '').map((f) => [f, obj[f]]));

const PROGRAM_WRITE_FIELDS = [
	'code',
	'name',
	'training_type_id',
	'department_id',
	'department_note',
	'target_audience',
	'theory_hours',
	'practice_hours',
	'credit_hours',
	'tuition_fee',
	'duration',
	'duration_value',
	'duration_unit',
];

const commit = async ({ programItems, lessonItems }, lookups, actorId) => {
	const counts = {
		programs_created: 0,
		programs_updated: 0,
		lessons_created: 0,
		lessons_updated: 0,
		links_created: 0,
	};
	const programIdByCode = new Map(lookups.programByCode);

	for (const [order, p] of programItems.entries()) {
		const data = pickFilled(p, PROGRAM_WRITE_FIELDS);
		const existingId = programIdByCode.get(p.code);
		if (existingId) {
			await programService.update(existingId, data, actorId);
			counts.programs_updated++;
		} else {
			const created = await programService.create({ ...data, display_order: order + 1 }, actorId);
			programIdByCode.set(p.code, created.id);
			counts.programs_created++;
		}
	}

	const orderByProgram = new Map();
	for (const l of lessonItems) {
		const programId = programIdByCode.get(l.program_code);
		if (!programId) continue;
		const data = {
			...pickFilled(l, ['code', 'title', 'duration_value', 'duration_unit']),
			lesson_kind: 'rotation',
			allow_split: l.allow_split,
			...(l.departments.length ? { department_ids: l.departments.map((d) => d.id) } : {}),
		};
		let lessonId = lookups.lessonByCode.get(l.code);
		if (lessonId) {
			await programService.updateLesson(lessonId, data, actorId);
			counts.lessons_updated++;
		} else {
			lessonId = (await programService.createLesson(data, actorId)).id;
			lookups.lessonByCode.set(l.code, lessonId);
			counts.lessons_created++;
		}

		const order = orderByProgram.get(programId) ?? 0;
		orderByProgram.set(programId, order + 1);
		const linkId = lookups.linkByPair.get(`${programId}|${lessonId}`);
		if (linkId) await programService.updateLessonLink(linkId, { display_order: order }, actorId);
		else {
			const link = await programService.linkLesson(programId, lessonId, order, actorId);
			lookups.linkByPair.set(`${programId}|${lessonId}`, link.id);
			counts.links_created++;
		}
	}
	return counts;
};

const importExcel = async ({ buffer, dry_run }, actorId) => {
	const parsed = await parseWorkbook(buffer);
	if (!parsed.programs.length) throw badRequest('File không có dòng chương trình nào.');
	const lookups = await loadLookups();
	const preview = buildPreview(parsed, lookups);
	if (!parsed.hasLessonSheet)
		preview.warnings.push(
			'Không thấy sheet vòng thực hành (cột "Mã", "Nội dung", "Thời gian") — chỉ nhập chương trình.',
		);

	const summary = {
		programs_total: preview.programItems.length,
		programs_new: preview.programItems.filter((p) => p.status === 'new').length,
		lessons_total: preview.lessonItems.length,
		lessons_new: preview.lessonItems.filter((l) => l.status === 'new').length,
	};
	if (dry_run) {
		return {
			dry_run: true,
			summary,
			programs: preview.programItems,
			lessons: preview.lessonItems,
			warnings: preview.warnings,
		};
	}
	const counts = await commit(preview, lookups, actorId);
	return { dry_run: false, summary, ...counts, warnings: preview.warnings };
};

module.exports = { importExcel, parseWorkbook, buildPreview };
