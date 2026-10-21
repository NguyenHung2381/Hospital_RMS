/**
 * traineeProgressService.js — học viên đang học THỰC TẾ thế nào so với chương
 * trình HIỆN TẠI của từng lượt ghi danh.
 *
 * Hồ sơ học viên là bản chép tại lúc ghi danh (enrollment_lessons cho bài lý
 * thuyết ĐTLT, enrollment_rotations cho vòng thực hành GPHN); chương trình có
 * thể bị sửa sau đó. Ở đây đặt 2 bên cạnh nhau:
 *   - mỗi bài / vòng của chương trình hiện tại + trạng thái của học viên;
 *   - bài / vòng chương trình mới thêm mà hồ sơ chưa có ("missing");
 *   - bài / vòng hồ sơ còn giữ nhưng chương trình đã bỏ ("extra", không tính %);
 *   - nhịp học: % đã hoàn thành so với % thời gian đã trôi qua.
 * Chỉ đọc, không sửa hồ sơ (đồng bộ lại vẫn làm ở màn hình khóa học).
 */
const { getPool, sql } = require('../../../config/db');
const { todayKeyVN } = require('../../../utils/vnDate');
const { formatDuration, toDays } = require('../../../utils/trainingDuration');

const DAY_MS = 86400000;
// Lệch quá 10 điểm % giữa hoàn thành và thời gian mới coi là nhanh / chậm.
const PACE_TOLERANCE = 0.1;

const day = (v) => {
	if (!v) return null;
	return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
};
const daysBetween = (a, b) =>
	Math.round(
		(new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY_MS,
	);

// Trạng thái 1 dòng vòng chưa có kết quả, theo ngày hôm nay.
const pendingState = (row, today) => {
	const s = day(row.start_date);
	const e = day(row.end_date);
	if (!s && !e) return 'not_scheduled';
	if (e && e < today) return 'overdue'; // đã hết thời gian vòng mà chưa chấm
	if (s && s > today) return 'scheduled';
	return 'in_progress';
};

// Ưu tiên khi gộp nhiều khoa của 1 vòng: cái cần chú ý nhất lên trước.
const ROUND_PRIORITY = ['failed', 'overdue', 'in_progress', 'scheduled', 'not_scheduled'];

/**
 * Gộp các dòng enrollment_rotations của 1 vòng thành 1 trạng thái. Mỗi khoa
 * (vòng chia nhiều khoa) chỉ xét lần học gần nhất — "không đạt" đã học lại thì
 * không còn tính là không đạt.
 */
const roundStatus = (rows, today) => {
	if (!rows.length) return 'missing';
	const latest = new Map();
	for (const r of rows) {
		const key = r.department_id || r.department_name || r.id;
		const cur = latest.get(key);
		if (
			!cur ||
			r.attempt_no > cur.attempt_no ||
			(r.attempt_no === cur.attempt_no && r.seq > cur.seq)
		)
			latest.set(key, r);
	}
	const states = [...latest.values()].map((r) =>
		r.result === 'pass' ? 'passed' : r.result === 'fail' ? 'failed' : pendingState(r, today),
	);
	if (states.every((s) => s === 'passed')) return 'passed';
	return ROUND_PRIORITY.find((p) => states.includes(p)) ?? 'not_scheduled';
};

const segmentOf = (r) => ({
	id: r.id,
	department_name: r.current_department_name || r.department_name || null,
	start_date: day(r.start_date),
	end_date: day(r.end_date),
	duration_text: r.duration_text || null,
	mentor_name: r.mentor_name || null,
	result: r.result,
	attempt_no: r.attempt_no,
});

const countBy = (items, key) =>
	items.reduce((acc, it) => ({ ...acc, [it[key]]: (acc[it[key]] ?? 0) + 1 }), {});

/**
 * Nhịp học: so % hoàn thành với % thời gian đã qua của [start, end].
 * Trả 'completed' | 'dropped' | 'not_started' | 'ahead' | 'on_track' | 'behind' | 'overdue' | 'unknown'.
 */
const paceOf = ({ progressStatus, start, end, completion, today }) => {
	if (progressStatus === 'completed') return { pace: 'completed', elapsed: 1 };
	if (progressStatus === 'dropped') return { pace: 'dropped', elapsed: null };
	if (!start || !end || end < start || completion == null)
		return { pace: 'unknown', elapsed: null };
	if (today < start) return { pace: 'not_started', elapsed: 0 };
	const total = daysBetween(start, end) + 1;
	const elapsed = Math.min(1, (daysBetween(start, today) + 1) / total);
	if (today > end && completion < 1) return { pace: 'overdue', elapsed: 1 };
	if (completion + PACE_TOLERANCE < elapsed) return { pace: 'behind', elapsed };
	if (completion > elapsed + PACE_TOLERANCE) return { pace: 'ahead', elapsed };
	return { pace: 'on_track', elapsed };
};

/**
 * Phần tính THUẦN (không DB) cho 1 lượt ghi danh.
 * @param {object} p
 * @param {object} p.enrollment         course_enrollments + courses (ngày khóa)
 * @param {object[]} p.programTheory    bài lý thuyết đang có trong chương trình
 * @param {object[]} p.recordTheory     enrollment_lessons của hồ sơ
 * @param {object[]} p.programRounds    vòng thực hành đang có trong chương trình
 * @param {object[]} p.recordRotations  enrollment_rotations của hồ sơ
 * @param {string} p.today              'YYYY-MM-DD'
 */
const buildProgress = ({
	enrollment,
	programTheory = [],
	recordTheory = [],
	programRounds = [],
	recordRotations = [],
	today,
}) => {
	// ── Lý thuyết ──
	const recByLesson = new Map(recordTheory.map((r) => [r.lesson_id, r]));
	const inProgram = new Set(programTheory.map((l) => l.id));
	const theoryItems = [
		...programTheory.map((l) => {
			const rec = recByLesson.get(l.id);
			return {
				lesson_id: l.id,
				code: l.code,
				title: l.title,
				hours: l.total_hours ?? null,
				in_program: true,
				status: rec ? rec.status : 'missing',
				completed_at: rec ? day(rec.completed_at) : null,
			};
		}),
		...recordTheory
			.filter((r) => !inProgram.has(r.lesson_id))
			.map((r) => ({
				lesson_id: r.lesson_id,
				code: r.code,
				title: r.title,
				hours: r.total_hours ?? null,
				in_program: false,
				status: r.status,
				completed_at: day(r.completed_at),
			})),
	];
	const theoryRequired = theoryItems.filter((i) => i.in_program);
	const theoryCount = countBy(theoryRequired, 'status');
	const sumHours = (list) => list.reduce((s, i) => s + (Number(i.hours) || 0), 0);
	const theory = {
		items: theoryItems,
		summary: {
			required: theoryRequired.length,
			done: theoryCount.done ?? 0,
			in_progress: theoryCount.in_progress ?? 0,
			not_started: theoryCount.not_started ?? 0,
			missing: theoryCount.missing ?? 0,
			extra: theoryItems.length - theoryRequired.length,
			hours_required: sumHours(theoryRequired),
			hours_done: sumHours(theoryRequired.filter((i) => i.status === 'done')),
		},
	};

	// ── Vòng thực hành ──
	const rowsByLesson = new Map();
	for (const r of recordRotations) {
		const key = r.lesson_id || `title:${r.round_title || r.id}`;
		if (!rowsByLesson.has(key)) rowsByLesson.set(key, []);
		rowsByLesson.get(key).push(r);
	}
	const roundIds = new Set(programRounds.map((x) => x.id));
	const roundItem = (base, rows, inProg) => ({
		...base,
		in_program: inProg,
		status: roundStatus(rows, today),
		segments: rows
			.slice()
			.sort((a, b) => a.seq - b.seq)
			.map(segmentOf),
	});
	const rotationItems = [
		...programRounds.map((x) =>
			roundItem(
				{
					lesson_id: x.id,
					code: x.code,
					title: x.title,
					required_duration: formatDuration(x.duration_value, x.duration_unit),
					required_days: toDays(x.duration_value, x.duration_unit),
				},
				rowsByLesson.get(x.id) ?? [],
				true,
			),
		),
		...[...rowsByLesson.entries()]
			.filter(([key]) => !roundIds.has(key))
			.map(([, rows]) =>
				roundItem(
					{
						lesson_id: rows[0].lesson_id || null,
						code: rows[0].round_code || null,
						title: rows[0].round_title || 'Vòng không rõ tên',
						required_duration: null,
						required_days: null,
					},
					rows,
					false,
				),
			),
	];
	const rotRequired = rotationItems.filter((i) => i.in_program);
	const rotCount = countBy(rotRequired, 'status');
	const sumDays = (list) => list.reduce((s, i) => s + (Number(i.required_days) || 0), 0);
	const rotations = {
		items: rotationItems,
		summary: {
			required: rotRequired.length,
			passed: rotCount.passed ?? 0,
			in_progress: rotCount.in_progress ?? 0,
			scheduled: rotCount.scheduled ?? 0,
			not_scheduled: rotCount.not_scheduled ?? 0,
			overdue: rotCount.overdue ?? 0,
			failed: rotCount.failed ?? 0,
			missing: rotCount.missing ?? 0,
			extra: rotationItems.length - rotRequired.length,
			days_required: sumDays(rotRequired),
			days_passed: sumDays(rotRequired.filter((i) => i.status === 'passed')),
		},
	};

	// ── Tổng: mỗi bài / vòng của chương trình hiện tại tính 1 phần ──
	const requiredUnits = theory.summary.required + rotations.summary.required;
	const doneUnits = theory.summary.done + rotations.summary.passed;
	const completion = requiredUnits ? doneUnits / requiredUnits : null;
	const start = day(enrollment.practice_start_date) || day(enrollment.course_start_date);
	const end = day(enrollment.practice_end_date) || day(enrollment.course_end_date);
	const { pace, elapsed } = paceOf({
		progressStatus: enrollment.progress_status,
		start,
		end,
		completion,
		today,
	});

	return {
		theory,
		rotations,
		summary: {
			required: requiredUnits,
			done: doneUnits,
			completion,
			start_date: start,
			end_date: end,
			elapsed,
			pace,
			// Hồ sơ lệch chương trình hiện tại → gợi ý đồng bộ lại ở màn hình khóa học
			out_of_sync:
				theory.summary.missing +
					theory.summary.extra +
					rotations.summary.missing +
					rotations.summary.extra >
				0,
		},
	};
};

const getProgress = async (traineeId) => {
	const pool = await getPool();
	const r = await pool.request().input('trainee_id', sql.VarChar(20), traineeId).query(`
    SELECT e.id, e.course_id, e.status, e.program_id, e.progress_status, e.progress_date,
           e.start_date AS practice_start_date, e.end_date AS practice_end_date,
           c.name AS course_name, c.start_date AS course_start_date, c.end_date AS course_end_date,
           tp.code AS program_code, tp.name AS program_name, tp.duration AS program_duration,
           tp.theory_hours AS program_theory_hours, tp.practice_hours AS program_practice_hours
    FROM course_enrollments e
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN training_programs tp ON tp.id = e.program_id
    WHERE e.trainee_id = @trainee_id AND e.status <> 'rejected';

    SELECT lp.program_id, pl.id, pl.code, pl.title, pl.total_hours, pl.lesson_kind, pl.is_active,
           pl.duration_value, pl.duration_unit, lp.display_order
    FROM lesson_programs lp
    JOIN program_lessons pl ON pl.id = lp.lesson_id
    WHERE lp.program_id IN (
      SELECT program_id FROM course_enrollments
      WHERE trainee_id = @trainee_id AND program_id IS NOT NULL AND status <> 'rejected')
    ORDER BY lp.display_order, pl.title;

    SELECT el.enrollment_id, el.lesson_id, el.status, el.completed_at, el.display_order,
           pl.code, pl.title, pl.total_hours
    FROM enrollment_lessons el
    JOIN course_enrollments e ON e.id = el.enrollment_id
    JOIN program_lessons pl ON pl.id = el.lesson_id
    WHERE e.trainee_id = @trainee_id
    ORDER BY el.display_order, pl.title;

    SELECT r.id, r.enrollment_id, r.lesson_id, r.round_title, r.seq, r.attempt_no, r.result,
           r.department_id, r.department_name, d.name AS current_department_name,
           r.start_date, r.end_date, r.duration_text, r.mentor_name, pl.code AS round_code
    FROM enrollment_rotations r
    JOIN course_enrollments e ON e.id = r.enrollment_id
    LEFT JOIN program_lessons pl ON pl.id = r.lesson_id
    LEFT JOIN departments d ON d.id = r.department_id
    WHERE e.trainee_id = @trainee_id
    ORDER BY r.seq, r.created_at;
  `);
	const [enrollments, programLessons, recordLessons, recordRotations] = r.recordsets;
	const today = todayKeyVN();
	const byKey = (list, key) => {
		const m = new Map();
		for (const x of list) {
			if (!m.has(x[key])) m.set(x[key], []);
			m.get(x[key]).push(x);
		}
		return m;
	};
	const lessonsByProgram = byKey(programLessons, 'program_id');
	const lessonsByEnrollment = byKey(recordLessons, 'enrollment_id');
	const rotationsByEnrollment = byKey(recordRotations, 'enrollment_id');

	return enrollments.map((en) => {
		const lessons = en.program_id ? (lessonsByProgram.get(en.program_id) ?? []) : [];
		return {
			enrollment_id: en.id,
			course_id: en.course_id,
			course_name: en.course_name,
			program_id: en.program_id,
			program_code: en.program_code,
			program_name: en.program_name,
			program_duration: en.program_duration,
			program_theory_hours: en.program_theory_hours,
			program_practice_hours: en.program_practice_hours,
			progress_status: en.progress_status,
			progress_date: day(en.progress_date),
			...buildProgress({
				enrollment: en,
				// Cùng quy tắc với syncLessons / loadRounds: bài lý thuyết chỉ tính bài còn dùng
				programTheory: lessons.filter((l) => l.lesson_kind === 'theory' && l.is_active),
				recordTheory: lessonsByEnrollment.get(en.id) ?? [],
				programRounds: lessons.filter((l) => l.lesson_kind === 'rotation'),
				recordRotations: rotationsByEnrollment.get(en.id) ?? [],
				today,
			}),
		};
	});
};

module.exports = { getProgress, buildProgress, roundStatus, paceOf };
