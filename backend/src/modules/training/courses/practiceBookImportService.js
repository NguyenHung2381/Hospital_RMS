/**
 * practiceBookImportService.js — nhập SỔ THỰC HÀNH GPHN cũ (Excel, mẫu 3.xlsx)
 * vào 1 khóa GPHN: học viên (theo CCCD) → hồ sơ ghi danh (theo MÃ THỰC HÀNH) →
 * các vòng khoa + người hướng dẫn (NHD). Nhập lại nhiều lần an toàn: hồ sơ trùng
 * mã thì cập nhật, vòng của hồ sơ được thay bằng vòng trong file.
 *
 * - Nhóm cột vòng lặp lại "Khoa thực hành n", "Thời gian bắt đầu khoa n"… — đọc
 *   theo VỊ TRÍ (cột sau "Khoa thực hành n" thuộc vòng n) vì sổ có tiêu đề gõ nhầm
 *   số; không cố định 11 vòng.
 * - Chương trình suy từ trình độ / lĩnh vực / hình thức hành nghề (hậu tố mã .DTH
 *   có lẫn KTV xét nghiệm). Chương trình chưa có trong danh mục → để trống, báo lại.
 * - Thông tin NHD giữ đúng như sổ (bản chụp — giấy tờ đã ký); MNV khớp nhân sự
 *   và trùng tên thì gắn thêm tài khoản để tra cứu / cảnh báo quá tải.
 * - Bỏ cột tính ra từ cột khác: Năm sinh, Ngày/Tháng/Năm (Đ/K), TH1–TH11.
 * - Dòng mới chỉ có thông tin học viên (+ ngày bắt đầu), chưa có mã / khoa ⇒ sau khi
 *   nhập hệ thống tự điền mã, vòng, khoa, NHD (practiceAutoService); chương trình
 *   chưa có vòng thì rút mẫu vòng từ chính các hồ sơ trong sổ.
 */
const { getPool, sql, withTransaction } = require('../../../config/db');
const { genCourseProgramId } = require('../../../utils/idGenerator');
const { isUniqueViolation } = require('../../../utils/dbErrors');
const { broadcast } = require('../../events/eventService');
const { norm } = require('../../../utils/vietnameseText');
const { loadWorkbook, findHeader, cellText, parseDateCell } = require('../../../utils/excelImport');
const { createDepartmentMatcher } = require('../../../utils/departmentMatch');
const { badRequest, httpError } = require('../../../utils/httpError');
const { parseDuration, toDays } = require('../../../utils/trainingDuration');
const { addToCatalogs, writeRecord } = require('./practiceBookWriter');

const RECORD_MATCHERS = [
	['practice_code', (h) => h === 'ma thuc hanh'],
	['full_name', (h) => h === 'ho va ten' || h === 'ho ten'],
	['qualification', (h) => h.includes('trinh do chuyen mon')],
	['professional_field', (h) => h === 'linh vuc chuyen mon'],
	['practice_form', (h) => h === 'hinh thuc hanh nghe'],
	['total_duration', (h) => h === 'tong thoi gian thuc hanh'],
	['start_date', (h) => h === 'ngay bat dau'],
	['end_date', (h) => h === 'ngay ket thuc'],
	['practice_location', (h) => h === 'dia diem thuc hanh'],
	['sending_unit', (h) => h === 'ghi chu'],
	['completed', (h) => h === 'da hoan thanh'],
	['dropped', (h) => h === 'nghi hoc'],
];

// Tên cột trong 1 nhóm vòng (bỏ số thứ tự / chữ "chính" ở cuối) → trường
/** @type {Array<[string, (b: string) => boolean]>} */
const ROTATION_COLUMNS = [
	['department', (b) => b === 'khoa thuc hanh'],
	['start_date', (b) => b === 'thoi gian bat dau khoa'],
	['end_date', (b) => b === 'thoi gian ket thuc khoa'],
	['duration_text', (b) => b === 'tong thoi gian khoa'],
	['mentor_name', (b) => b === 'nguoi huong dan' || b.startsWith('nguoi huong dan chinh')],
	['mentor_salutation', (b) => b === 'ong ba'],
	['mentor_staff_no', (b) => b === 'mnv'],
	['mentor_dob', (b) => b === 'ngay sinh ng huong dan'],
	['mentor_qualification', (b) => b === 'tdcm ng huong dan'],
	['mentor_license_no', (b) => b === 'so cchn'],
	['mentor_license_date', (b) => b === 'ngay cap cchn'],
	['mentor_phone', (b) => b === 'dien thoai'],
	[
		'mentor_scope',
		(b) =>
			b === 'pvhdcm cua nhd th' || b.startsWith('pham vi hoat dong chuyen mon cua nguoi huong dan'),
	],
];
const DATE_FIELDS = new Set(['start_date', 'end_date', 'mentor_dob', 'mentor_license_date']);

/** Dò nhóm cột vòng trên dòng tiêu đề: [{ key: 1..n | 'main', cols: { field: colNo } }] */
const findRotationGroups = (headerRow) => {
	const groups = [];
	let current = null;
	headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
		const h = norm(cellText(cell));
		const start = h.match(/^khoa thuc hanh (\d+)$/);
		if (start) {
			current = { key: Number(start[1]), cols: { department: col } };
			groups.push(current);
			return;
		}
		if (h.startsWith('nguoi huong dan chinh')) {
			current = { key: 'main', cols: { mentor_name: col } };
			groups.push(current);
			return;
		}
		if (!current) return;
		const base = h.replace(/\s+(\d+|chinh)$/, '');
		const hit = ROTATION_COLUMNS.find(([, test]) => test(base));
		if (hit && current.cols[hit[0]] == null) current.cols[hit[0]] = col;
		else if (!hit && !/^(th\d+|ghi chu|da hoan thanh|nghi hoc)$/.test(h)) current = null; // hết nhóm
	});
	return groups;
};

/**
 * Chương trình GPHN suy từ trình độ + lĩnh vực + hình thức hành nghề (mã trong danh
 * mục 1.xlsx). "… về Hồi sức cấp cứu" là chương trình *_2.
 */
const inferProgramCode = ({
	qualification,
	professional_field,
	practice_form,
	suffix,
	total_duration,
}) => {
	const form = norm(practice_form);
	const text = norm(`${qualification ?? ''} ${professional_field ?? ''}`);
	// Dòng mới không ghi hình thức hành nghề: thực hành ≤ 3 tháng là chương trình "về HSCC"
	const total = parseDuration(total_duration);
	const hscc = form
		? /hoi suc cap cuu/.test(form)
		: !!total && toDays(total.value, total.unit) <= 92;
	const pick = (base) => `${base}_${hscc ? 2 : 1}`;
	if (/dinh duong|sinh duong/.test(text)) return 'GPHN_DD_1';
	if (/xet nghiem/.test(text)) return pick('GPHN_KTVXN');
	if (/hinh anh/.test(text)) return pick('GPHN_KTVXQ');
	if (/khuc xa/.test(text)) return pick('GPHN_KTVNK');
	if (/ky thuat/.test(text) && /phuc hoi chuc nang/.test(text)) return pick('GPHN_KTVPHCN');
	if (/ho sinh|phu san/.test(text)) return pick('GPHN_HS');
	if (/dieu duong/.test(text)) return pick('GPHN_DTH');
	if (/y si/.test(text)) return /y hoc co truyen/.test(text) ? 'GPHN_YS_2' : 'GPHN_YS_1';
	if (/bac si/.test(text) || norm(suffix) === 'bs') {
		if (hscc) return 'GPHN_BS_2';
		if (/rang ham mat/.test(text)) return 'GPHN_BS_5';
		if (/y hoc co truyen/.test(text)) return 'GPHN_BS_4';
		if (/chuyen khoa/.test(`${text} ${form}`)) return 'GPHN_BS_3';
		return 'GPHN_BS_1';
	}
	const bySuffix = { dth: 'GPHN_DTH', hs: 'GPHN_HS' }[norm(suffix)];
	return bySuffix ? pick(bySuffix) : null;
};

const isYes = (v) => !!norm(v) && !['khong', '0', 'k', 'no'].includes(norm(v));

const parseBook = async (buffer) => {
	const workbook = await loadWorkbook(buffer);
	const header = findHeader(workbook, RECORD_MATCHERS, (c) => !!(c.practice_code && c.full_name));
	if (!header)
		throw badRequest(
			'Không thấy dòng tiêu đề sổ thực hành (cần cột "Mã thực hành" và "Họ và tên").',
		);
	const { ws, headerRow, cols } = header;
	const groups = findRotationGroups(ws.getRow(headerRow));
	if (!groups.some((g) => g.key !== 'main'))
		throw badRequest('Không thấy nhóm cột "Khoa thực hành 1…".');

	const text = (row, col) => (col ? cellText(row.getCell(col)) : '');
	const records = [];
	for (let r = headerRow + 1; r <= (ws.rowCount || headerRow); r++) {
		const row = ws.getRow(r);
		const code = text(row, cols.practice_code).replace(/\s+/g, '');
		if (!text(row, cols.full_name)) continue; // mã trống: hồ sơ mới, mã tự sinh khi xếp vòng
		const readGroup = (g) => {
			const o = {};
			for (const [field, col] of Object.entries(g.cols))
				o[field] = DATE_FIELDS.has(field)
					? parseDateCell(row.getCell(col))
					: text(row, col) || null;
			return o;
		};
		const rotations = groups
			.filter((g) => g.key !== 'main')
			.map(readGroup)
			.filter((x) => x.department || x.start_date || x.mentor_name);
		const main = groups.find((g) => g.key === 'main');
		records.push({
			row: r,
			practice_code: code,
			full_name: text(row, cols.full_name),
			suffix: code.split('.').slice(1).join('.').trim(),
			qualification: text(row, cols.qualification) || null,
			professional_field: text(row, cols.professional_field) || null,
			practice_form: text(row, cols.practice_form) || null,
			total_duration: text(row, cols.total_duration) || null,
			start_date: cols.start_date ? parseDateCell(row.getCell(cols.start_date)) : null,
			end_date: cols.end_date ? parseDateCell(row.getCell(cols.end_date)) : null,
			practice_location: text(row, cols.practice_location) || null,
			sending_unit: text(row, cols.sending_unit) || null,
			completed: isYes(text(row, cols.completed)),
			dropped: isYes(text(row, cols.dropped)),
			rotations,
			main_mentor: main ? readGroup(main) : null,
		});
	}
	if (!records.length) throw badRequest('File không có hồ sơ nào (cột "Họ và tên" trống).');
	return records;
};

const loadLookups = async (courseId) => {
	const pool = await getPool();
	const q = (s) => pool.request().input('course_id', sql.VarChar(20), courseId).query(s);
	const [course, depts, programs, links, users, enrollments, rounds] = await Promise.all([
		q('SELECT id, name, is_rolling FROM courses WHERE id = @course_id'),
		q('SELECT id, name FROM departments'),
		q("SELECT id, code, name FROM training_programs WHERE LEFT(code, 5) = 'GPHN_'"),
		q('SELECT program_id FROM course_programs WHERE course_id = @course_id'),
		q(
			'SELECT id, staff_number, full_name FROM users WHERE staff_number IS NOT NULL ORDER BY is_active DESC',
		),
		q(
			'SELECT id, course_id, trainee_id, practice_code FROM course_enrollments WHERE practice_code IS NOT NULL',
		),
		q(`SELECT lp.program_id, pl.id AS lesson_id, pl.title, ld.department_id
       FROM lesson_programs lp JOIN program_lessons pl ON pl.id = lp.lesson_id
       LEFT JOIN lesson_departments ld ON ld.lesson_id = pl.id
       WHERE pl.lesson_kind = 'rotation'`),
	]);
	if (!course.recordset[0]) throw httpError(404, 'Khóa học không tồn tại.');
	const userByStaffNo = new Map();
	for (const u of users.recordset)
		if (!userByStaffNo.has(u.staff_number)) userByStaffNo.set(u.staff_number, u);
	// (chương trình, khoa) → vòng của chương trình có khoa đó
	const roundByProgramDept = new Map();
	for (const x of rounds.recordset)
		if (x.department_id && !roundByProgramDept.has(`${x.program_id}|${x.department_id}`))
			roundByProgramDept.set(`${x.program_id}|${x.department_id}`, {
				lesson_id: x.lesson_id,
				title: x.title,
			});
	return {
		course: course.recordset[0],
		matchDept: createDepartmentMatcher(depts.recordset),
		programByCode: new Map(programs.recordset.map((p) => [p.code, p])),
		linkedPrograms: new Set(links.recordset.map((l) => l.program_id)),
		userByStaffNo,
		enrollmentByCode: new Map(enrollments.recordset.map((e) => [e.practice_code, e])),
		roundByProgramDept,
	};
};

// Gom cảnh báo trùng nội dung: "… (dòng 3, 7, 12)"
const collector = () => {
	const map = new Map();
	return {
		add: (msg, row) => map.set(msg, [...(map.get(msg) ?? []), row]),
		list: () =>
			[...map].map(([msg, rows]) =>
				rows.length > 8
					? `${msg} (${rows.length} dòng: ${rows.slice(0, 8).join(', ')}…)`
					: `${msg} (dòng ${rows.join(', ')})`,
			),
	};
};

const buildPreview = (records, traineePreview, lookups) => {
	const warn = collector();
	const traineeByRow = new Map(traineePreview.map((t) => [t.row, t]));
	const seenCodes = new Set();
	const items = records.map((rec) => {
		const t = traineeByRow.get(rec.row);
		const code = inferProgramCode(rec);
		const program = code ? lookups.programByCode.get(code) : null;
		if (!code) warn.add('Không suy ra được chương trình — để trống', rec.row);
		else if (!program)
			warn.add(
				`Chưa có chương trình ${code} trong danh mục (nhập danh mục 1.xlsx trước) — để trống`,
				rec.row,
			);
		const existing = rec.practice_code ? lookups.enrollmentByCode.get(rec.practice_code) : null;
		if (existing && existing.course_id !== lookups.course.id)
			warn.add('Mã thực hành đã thuộc khóa khác — bỏ qua hồ sơ', rec.row);
		// Mã thực hành của ghi danh đã có chủ: CCCD của dòng phải trỏ đúng học viên đó, nếu không
		// import sẽ chuyển ghi danh (kèm chứng chỉ, điểm) sang người khác ⇒ bỏ qua hồ sơ
		const ownerMismatch =
			!!existing &&
			existing.course_id === lookups.course.id &&
			(!t?.trainee_id || t.trainee_id !== existing.trainee_id);
		if (ownerMismatch)
			warn.add('Mã thực hành thuộc học viên khác (CCCD không khớp) — bỏ qua hồ sơ', rec.row);
		if (rec.practice_code && seenCodes.has(rec.practice_code))
			warn.add('Mã thực hành lặp lại trong file — bỏ qua dòng sau', rec.row);
		if (rec.practice_code) seenCodes.add(rec.practice_code);

		const mentorOf = (g) => {
			if (!g?.mentor_name) return null;
			const staffNo = parseInt(String(g.mentor_staff_no ?? '').replace(/\D+/g, ''), 10);
			const user = Number.isFinite(staffNo) ? lookups.userByStaffNo.get(staffNo) : null;
			let userId = null;
			if (g.mentor_staff_no && !user)
				warn.add(`Không thấy nhân sự MNV ${g.mentor_staff_no} — chỉ lưu tên NHD`, rec.row);
			else if (user && norm(user.full_name) !== norm(g.mentor_name))
				warn.add(
					`MNV ${staffNo} là "${user.full_name}" nhưng sổ ghi "${g.mentor_name}" — không gắn tài khoản`,
					rec.row,
				);
			else if (user) userId = user.id;
			return { ...g, user_id: userId };
		};

		const rotations = rec.rotations.map((rot, i) => {
			const dept = rot.department ? lookups.matchDept(rot.department) : null;
			if (rot.department && !dept?.id)
				warn.add(
					dept?.ambiguous
						? `Khoa "${rot.department}" khớp nhiều khoa`
						: `Không khớp khoa "${rot.department}"`,
					rec.row,
				);
			let { start_date, end_date } = rot;
			if (start_date && end_date && end_date < start_date) {
				warn.add('Vòng có ngày kết thúc trước ngày bắt đầu — bỏ ngày', rec.row);
				start_date = end_date = null;
			}
			const round =
				dept?.id && program ? lookups.roundByProgramDept.get(`${program.id}|${dept.id}`) : null;
			// Trải thông tin NHD trước — các trường đã làm sạch bên dưới phải thắng
			return {
				...mentorOf(rot),
				seq: (i + 1) * 10,
				lesson_id: round?.lesson_id ?? null,
				round_title: round?.title ?? (rot.department ? `Khoa ${rot.department}` : null),
				department_id: dept?.id ?? null,
				department_name: dept?.name ?? rot.department,
				start_date,
				end_date,
				duration_text: rot.duration_text,
			};
		});
		if (!rotations.length && rec.practice_location)
			warn.add('Chỉ có địa điểm chung, chưa có lịch từng khoa', rec.row);

		return {
			row: rec.row,
			practice_code: rec.practice_code,
			full_name: rec.full_name,
			trainee_action: t?.action ?? 'new',
			action: existing ? 'update' : 'new',
			skip: (existing && existing.course_id !== lookups.course.id) || ownerMismatch || false,
			owner_mismatch: ownerMismatch,
			enrollment_id: existing?.course_id === lookups.course.id ? existing.id : null,
			program_code: code,
			program_id: program?.id ?? null,
			record: rec,
			rotations,
			main_mentor: mentorOf(rec.main_mentor),
		};
	});
	// Bỏ dòng sau của mã lặp (dòng chưa có mã không tính)
	const firstRow = new Map();
	const keyOf = (it) => it.practice_code || `#${it.row}`;
	for (const it of items) if (!firstRow.has(keyOf(it))) firstRow.set(keyOf(it), it.row);
	for (const it of items) if (firstRow.get(keyOf(it)) !== it.row) it.skip = true;
	return { items, warnings: warn.list() };
};

// Chỉ dòng MỚI (chưa có mã thực hành) mới tự xếp — hồ sơ cũ chỉ ghi địa điểm chung giữ nguyên, không bịa lịch.
const needsArrange = (it) => !it.practice_code && !it.rotations.length && !!it.program_id;

const importBook = async (courseId, { buffer, dry_run }, actorId) => {
	// require muộn — traineeImportService kéo theo traineeService (tránh vòng require qua module courses)
	const traineeImport = require('../trainees/traineeImportService');
	const records = await parseBook(buffer);
	const [{ rows: traineeRows }, lookups, traineeLookups] = await Promise.all([
		traineeImport.parseWorkbook(buffer),
		loadLookups(courseId),
		traineeImport.loadLookups(),
	]);
	if (!lookups.course.is_rolling)
		throw badRequest(
			'Sổ thực hành chỉ nhập vào khóa GPHN mở liên tục (sửa khóa: bật "Mở liên tục").',
		);
	const allTraineePreview = traineeImport.buildPreview(traineeRows, traineeLookups);
	const { items, warnings } = buildPreview(records, allTraineePreview, lookups);
	const kept = items.filter((it) => !it.skip);
	// Dòng bị bỏ vì CCCD không khớp chủ ghi danh thì cũng không ghi / sửa hồ sơ học viên của dòng đó
	const mismatchRows = new Set(items.filter((it) => it.owner_mismatch).map((it) => it.row));
	const traineePreview = allTraineePreview.filter((t) => !mismatchRows.has(t.row));

	const programCounts = {};
	for (const it of kept)
		programCounts[it.program_code ?? '(chưa rõ)'] =
			(programCounts[it.program_code ?? '(chưa rõ)'] ?? 0) + 1;
	const summary = {
		records: kept.length,
		records_new: kept.filter((it) => it.action === 'new').length,
		records_update: kept.filter((it) => it.action === 'update').length,
		skipped: items.length - kept.length,
		trainees_new: traineePreview.filter((t) => t.action === 'new').length,
		trainees_update: traineePreview.filter((t) => t.action !== 'new').length,
		rotations: kept.reduce((s, it) => s + it.rotations.length, 0),
		mentors_linked: kept.reduce((s, it) => s + it.rotations.filter((r) => r.user_id).length, 0),
		programs: programCounts,
		// Hồ sơ chưa có khoa nào trong sổ ⇒ tự xếp vòng / khoa / NHD sau khi nhập
		auto_arrange: kept.filter(needsArrange).length,
	};
	const rows = kept.map((it) => ({
		row: it.row,
		practice_code: it.practice_code,
		full_name: it.full_name,
		action: it.action,
		trainee_action: it.trainee_action,
		program_code: it.program_code,
		program_found: !!it.program_id,
		rotations: it.rotations.length,
		auto: needsArrange(it),
		departments: it.rotations
			.map((r) => r.department_name)
			.filter(Boolean)
			.join(', '),
	}));
	if (dry_run) return { dry_run: true, summary, rows, warnings };

	const pool = await getPool();
	const { inserted, updated, idByRow } = await traineeImport.writeTrainees(traineePreview, actorId);
	// Gắn chương trình dùng trong sổ vào khóa (course_programs) nếu chưa có
	const programIds = [...new Set(kept.map((it) => it.program_id).filter(Boolean))].filter(
		(id) => !lookups.linkedPrograms.has(id),
	);
	for (const programId of programIds)
		await withTransaction(async (tx) =>
			tx
				.request()
				.input('new_id', sql.VarChar(20), await genCourseProgramId(tx))
				.input('course_id', sql.VarChar(20), courseId)
				.input('program_id', sql.VarChar(20), programId)
				.input('actor_id', sql.VarChar(20), actorId).query(`
        INSERT INTO course_programs (id, course_id, program_id, status, created_by)
        VALUES (@new_id, @course_id, @program_id, 'active', @actor_id);
      `),
		);

	const failed = [];
	let written = 0;
	const toArrange = [];
	for (const it of kept) {
		try {
			const id = await writeRecord(pool, it, idByRow.get(it.row), courseId, actorId);
			written++;
			if (needsArrange(it)) toArrange.push({ id, it });
		} catch (err) {
			const dup = isUniqueViolation(err);
			failed.push(
				`Dòng ${it.row} (${it.practice_code}): ${dup ? 'học viên đã có hồ sơ cùng chương trình trong khóa' : err.message}`,
			);
		}
	}
	await addToCatalogs(
		pool,
		kept.map((it) => it.record),
		actorId,
	);
	// Chương trình chưa có vòng ⇒ rút mẫu từ các hồ sơ vừa nhập; rồi tự xếp hồ sơ chưa có khoa
	const practiceAuto = require('./practiceAutoService');
	const templates = await practiceAuto.buildTemplates(
		kept.map((it) => it.program_id),
		actorId,
	);
	let arranged = 0;
	for (const { id, it } of toArrange) {
		try {
			await practiceAuto.arrangeOne(id, { startDate: it.record.start_date }, actorId);
			arranged++;
		} catch (err) {
			// 409: nhập lại sổ, hồ sơ đã được xếp lần trước ⇒ giữ nguyên
			if (err.statusCode !== 409)
				failed.push(`Dòng ${it.row} (${it.full_name}): chưa tự xếp được — ${err.message}`);
		}
	}
	broadcast('update', { entity: 'course_enrollment' });
	broadcast('update', { entity: 'trainee' });
	return {
		dry_run: false,
		summary,
		written,
		trainees_inserted: inserted,
		trainees_updated: updated,
		programs_linked: programIds.length,
		templates,
		arranged,
		warnings: [...failed, ...warnings],
	};
};

module.exports = { importBook, parseBook, buildPreview, inferProgramCode, findRotationGroups };
