/**
 * teachingPlanService.js — Dựng file mẫu "Kế hoạch giảng dạy" của 1 khóa (hoặc 1 chương
 * trình trong khóa) từ các buổi đã xếp: mỗi bài 1 khối dòng, mỗi phần LT / TH gom các buổi
 * liền nhau cùng giảng viên chính + trợ giảng thành 1 dòng "Từ ngày … đến ngày …". Nhập lại
 * nguyên file thì mọi dòng "không đổi" (sessionLecturerImportService).
 */
const { getPool, sql } = require('../../../config/db');
const { norm } = require('../../../utils/vietnameseText');
const { fmtDateVN } = require('../../../utils/vnDate');
const { buildTeachingPlanTemplate } = require('./exports/teachingPlanTemplate');
const { courseCmeApplies, lecturerCreditFactor } = require('./courseCmeService');
const {
	loadLookups,
	ymdOf,
	hm,
	kindOfSession,
	groupBy,
} = require('./sessionLecturerImportService');

const KINDS = ['theory', 'practice'];

/** Các phần cần có dòng: phần đã có buổi + phần có số tiết; bài chưa có gì ⇒ cả LT lẫn TH. */
const kindsOf = (lesson, sessions) => {
	const set = new Set(sessions.map(kindOfSession));
	if (Number(lesson.theory_hours) > 0) set.add('theory');
	if (Number(lesson.practice_hours) > 0) set.add('practice');
	return set.size ? KINDS.filter((k) => set.has(k)) : KINDS;
};

const comboOf = (s) =>
	`${s.lecturer_id || ''}|${(s.assistants || [])
		.map((a) => a.id)
		.sort()
		.join(',')}`;

/**
 * Số tiết của 1 dòng (1 đợt): phần chia nhiều đợt thì số tiết phần chia theo số buổi của đợt
 * (phần 46 tiết, 4 buổi, đợt 1 buổi ⇒ 11,5) để cộng theo dòng ở khối tổng ra đúng tổng phần.
 * Làm tròn 2 chữ số; phần không có số tiết ⇒ null.
 */
const rowHours = (hours, runSessions, partSessions) =>
	hours == null || !partSessions
		? hours
		: Math.round((hours * runSessions * 100) / partSessions) / 100;

/**
 * Buổi của 1 phần (đã sắp theo ngày, giờ) → các dòng: gom buổi liền nhau cùng người dạy.
 * Đợt nào có ngày trùng với đợt khác (cùng ngày 2 buổi khác người) thì tách từng buổi và
 * ghi kèm giờ bắt đầu để nhập lại không lẫn.
 */
const runsOf = (sessions) => {
	const runs = [];
	for (const s of sessions) {
		const last = runs[runs.length - 1];
		if (last && last.key === comboOf(s)) last.items.push(s);
		else runs.push({ key: comboOf(s), items: [s] });
	}
	const datesOf = (run) => new Set(run.items.map((s) => ymdOf(s.session_date)));
	const out = [];
	runs.forEach((run, i) => {
		const mine = datesOf(run);
		const shared = runs.some((o, j) => j !== i && [...datesOf(o)].some((d) => mine.has(d)));
		if (!shared) out.push({ items: run.items, withTime: false });
		else for (const s of run.items) out.push({ items: [s], withTime: true });
	});
	return out;
};

const timeText = ({ items, withTime }) => {
	const from = ymdOf(items[0].session_date);
	const to = ymdOf(items[items.length - 1].session_date);
	if (from !== to) return `Từ ngày ${fmtDateVN(from)} đến ngày ${fmtDateVN(to)}`;
	const start = withTime && items[0].start_time ? ` (${hm(items[0].start_time)})` : '';
	return `Ngày ${fmtDateVN(from)}${start}`;
};

const buildTemplate = async (courseId, { programId = null } = {}) => {
	const { course, lessons, sessions, lecturers } = await loadLookups(courseId);
	const lecturerById = new Map(lecturers.map((l) => [l.id, l]));
	let program = null;
	if (programId) {
		const pool = await getPool();
		program = (
			await pool
				.request()
				.input('course_id', sql.VarChar(20), courseId)
				.input('program_id', sql.VarChar(20), programId).query(`
          SELECT tp.code, tp.name, cp.start_date, cp.end_date
          FROM course_programs cp JOIN training_programs tp ON tp.id = cp.program_id
          WHERE cp.course_id = @course_id AND cp.program_id = @program_id`)
		).recordset[0];
	}
	const shown = program
		? lessons.filter((l) =>
				String(l.program_ids || '')
					.split(',')
					.includes(programId),
			)
		: lessons;
	const sessionsOf = groupBy(sessions, (s) => s.subject_id || '');
	const sortKey = (s) => `${ymdOf(s.session_date)} ${hm(s.start_time) || '99:99'}`;

	const person = (id) => lecturerById.get(id);
	const codeOf = (id) => (person(id)?.staff_number == null ? '' : String(person(id).staff_number));
	const rowsOf = (lesson) => {
		const list = (sessionsOf.get(lesson.id) || [])
			.slice()
			.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
		const rows = [];
		for (const kind of kindsOf(lesson, list)) {
			const raw = kind === 'theory' ? lesson.theory_hours : lesson.practice_hours;
			const hours = Number(raw) > 0 ? Number(raw) : null;
			const part = list.filter((s) => kindOfSession(s) === kind);
			const runs = runsOf(part);
			if (!runs.length) rows.push({ kind, hours, time: '' });
			runs.forEach((run) => {
				const s = run.items[0];
				const assts = (s.assistants || []).map((a) => a.id);
				const codes = assts.map(codeOf);
				rows.push({
					kind,
					hours: rowHours(hours, run.items.length, part.length),
					main_code: s.lecturer_id ? codeOf(s.lecturer_id) : '',
					main: s.lecturer_name || '',
					// Người không có mã ghi "-" để mã và họ tên khớp thứ tự
					asst_codes: codes.some(Boolean) ? codes.map((c) => c || '-').join('; ') : '',
					assts: (s.assistants || []).map((a) => a.name).join('; '),
					time: timeText(run),
				});
			});
		}
		return rows;
	};

	const [applies, factor] = await Promise.all([courseCmeApplies(courseId), lecturerCreditFactor()]);

	const start = program?.start_date || course.start_date;
	const end = program?.end_date || course.end_date;
	const workbook = buildTeachingPlanTemplate({
		title: `Lớp: ${program ? program.name : course.name}`,
		period: `Thời gian đào tạo: từ ngày ${start ? fmtDateVN(start) : '…'} đến ngày ${end ? fmtDateVN(end) : '…'}`,
		lessons: shown.map((l) => ({ code: l.code, title: l.title, rows: rowsOf(l) })),
		cme: applies ? { factor } : null,
	});
	const slug =
		norm(program ? program.name || program.code : course.name)
			.replace(/\s+/g, '-')
			.slice(0, 60) || 'khoa-hoc';
	return { workbook, fileName: `ke-hoach-giang-day_${slug}.xlsx` };
};

module.exports = { buildTemplate, runsOf, kindsOf, rowHours };
