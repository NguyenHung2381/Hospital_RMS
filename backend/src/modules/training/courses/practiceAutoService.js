/**
 * practiceAutoService.js — tự động hoá hồ sơ thực hành GPHN để phòng Đào tạo chỉ
 * cần nhập thông tin học viên + ngày bắt đầu, phần còn lại của sổ hệ thống tự điền:
 *   - buildTemplates: chương trình GPHN chưa có vòng ⇒ rút mẫu vòng (nhóm khoa, thời
 *     lượng, khoa được đi) từ các hồ sơ đã nhập của sổ cũ — rotationPlanner.deriveTemplate.
 *   - arrange: 1 hồ sơ ⇒ mã thực hành, lĩnh vực / hình thức / tổng thời gian, sinh vòng,
 *     xếp lịch SO LE (thứ tự vòng + khoa ít học viên nhất), NHD đang kèm ít nhất,
 *     địa điểm thực hành. Chỉ xếp hồ sơ ĐÃ DUYỆT — duyệt là bước riêng của phòng Đào
 *     tạo, duyệt xong mới xếp lịch. Vòng đã có kết quả (Đạt / Không
 *     đạt, kể cả vòng công nhận từ hồ sơ trước) giữ nguyên, chỉ xếp phần còn lại từ sau
 *     vòng cuối đã học; firstLessonId ép vòng vào trước (học khoa khác rồi mới sang Cấp cứu).
 *   - arrangeCourse: arrange mọi hồ sơ của khóa chưa có vòng, lần lượt — hồ sơ sau
 *     thấy lịch của hồ sơ trước nên tự tránh khoa / NHD đã đông.
 *   - completeFinished: job hằng ngày — qua ngày kết thúc, mọi vòng đã có kết quả, không
 *     vòng nào trượt ⇒ hoàn thành.
 * Mọi thứ tự điền vẫn sửa tay được ở hồ sơ; cảnh báo vòng vẫn hiện như cũ.
 */
const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { httpError } = require('../../../utils/httpError');
const { norm } = require('../../../utils/vietnameseText');
const { parseDuration, toDays } = require('../../../utils/trainingDuration');
const { todayVN } = require('../../../utils/vnDate');
const logger = require('../../../config/logger');
const rotationService = require('./enrollmentRotationService');
const trainingProgramService = require('../programs/trainingProgramService');
const {
	deriveTemplate,
	arrangeRotations,
	pickMentor,
	practiceLocation,
	describeSpan,
	dayStr: day,
} = require('./rotationPlanner');

const notify = () => broadcast('update', { entity: 'course_enrollment' });

// GPHN_BS_1 → BS, GPHN_KTVXN_2 → KTV (hậu tố mã thực hành như sổ: 226.BS, 235.DTH, 237.KTV)
const codeSuffix = (programCode) => {
	const base = /^GPHN_([A-Z]+)_/.exec(programCode ?? '')?.[1];
	return !base ? null : base.startsWith('KTV') ? 'KTV' : base;
};
const isDoctorProgram = (programCode) => /^GPHN_(BS|YS)_/.test(programCode ?? '');
// ponytail: đoán nhóm NHD theo chữ trình độ; NHD từng kèm khoa trong sổ được ưu tiên trước nên chỉ dùng khi khoa chưa có lịch sử.
const isDoctorQualification = (q) =>
	!/dieu duong|\bdd\b|ho sinh|ky thuat|ktv|cu nhan/.test(norm(q));

/** Chương trình GPHN chưa có vòng nào ⇒ tạo mẫu vòng từ hồ sơ đã có. Trả [{ program_code, rounds }]. */
const buildTemplates = async (programIds, actorId) => {
	const pool = await getPool();
	const created = [];
	for (const programId of [...new Set(programIds.filter(Boolean))]) {
		const prog = (
			await pool.request().input('id', sql.VarChar(20), programId).query(`
        SELECT tp.id, tp.code, tp.duration, tp.duration_value, tp.duration_unit,
               (SELECT COUNT(*) FROM lesson_programs lp JOIN program_lessons pl ON pl.id = lp.lesson_id
                WHERE lp.program_id = tp.id AND pl.lesson_kind = 'rotation') AS rounds
        FROM training_programs tp WHERE tp.id = @id`)
		).recordset[0];
		if (!prog || prog.rounds || !/^GPHN_/.test(prog.code ?? '')) continue;

		const hist = await pool.request().input('id', sql.VarChar(20), programId).query(`
      SELECT r.enrollment_id, r.department_id, d.name AS department_name, r.start_date, r.end_date, r.duration_text
      FROM enrollment_rotations r
      JOIN course_enrollments e ON e.id = r.enrollment_id
      JOIN departments d ON d.id = r.department_id
      WHERE e.program_id = @id
      ORDER BY r.enrollment_id, r.seq`);
		const byEnrollment = new Map();
		for (const h of hist.recordset)
			byEnrollment.set(h.enrollment_id, [...(byEnrollment.get(h.enrollment_id) ?? []), h]);
		const dur = prog.duration_value
			? { value: Number(prog.duration_value), unit: prog.duration_unit }
			: parseDuration(prog.duration);
		const rounds = deriveTemplate(
			[...byEnrollment.values()].map((rotations) => ({ rotations })),
			dur ? toDays(dur.value, dur.unit) : null,
		);
		if (!rounds?.length) continue;

		for (const [i, round] of rounds.entries()) {
			const d = parseDuration(round.duration_text);
			const { id } = await trainingProgramService.createLesson(
				{
					code: `${prog.code}_V${i + 1}`,
					title: round.title,
					lesson_kind: 'rotation',
					duration_value: d?.value,
					duration_unit: d?.unit,
					allow_split: round.allow_split,
					department_ids: round.department_ids,
				},
				actorId,
			);
			await trainingProgramService.linkLesson(programId, id, i, actorId);
		}
		// Vòng đã nhập từ sổ (chưa gắn vòng) ⇒ gắn theo khoa
		await pool.request().input('id', sql.VarChar(20), programId).query(`
      UPDATE r SET lesson_id = pl.id, round_title = pl.title
      FROM enrollment_rotations r
      JOIN course_enrollments e ON e.id = r.enrollment_id
      JOIN lesson_programs lp ON lp.program_id = e.program_id
      JOIN program_lessons pl ON pl.id = lp.lesson_id AND pl.lesson_kind = 'rotation'
      JOIN lesson_departments ld ON ld.lesson_id = pl.id AND ld.department_id = r.department_id
      WHERE e.program_id = @id AND r.lesson_id IS NULL`);
		created.push({ program_code: prog.code, rounds: rounds.length });
	}
	return created;
};

// Số mã: số "Mã học viên" của học viên nếu chưa dùng với hậu tố này, không thì số lớn nhất + 1.
const practiceCodeFor = async (pool, e) => {
	const suffix = codeSuffix(e.program_code);
	if (!suffix) return { code: null, number: null };
	const r = await pool.request().query(`
    SELECT practice_code FROM course_enrollments WHERE practice_code IS NOT NULL;
    SELECT MAX(TRY_CAST(legacy_code AS INT)) AS max_legacy FROM trainees;`);
	const used = new Set(r.recordsets[0].map((x) => x.practice_code));
	const own = /^\d+$/.test(String(e.legacy_code ?? '').trim()) ? Number(e.legacy_code) : null;
	if (own != null && !used.has(`${own}.${suffix}`))
		return { code: `${own}.${suffix}`, number: own };
	const nums = [...used].map((c) => parseInt(c, 10)).filter(Number.isFinite);
	const number = Math.max(0, r.recordsets[1][0].max_legacy ?? 0, ...nums) + 1;
	return { code: `${number}.${suffix}`, number };
};

// NHD ứng viên cho từng khoa: người từng kèm khoa đó cho học viên cùng nhóm (bác sĩ /
// không phải bác sĩ), kèm nhiều xếp trước; rồi nhân sự của khoa có CCHN cùng nhóm.
const loadMentorCandidates = async (pool, doctor) => {
	const r = await pool.request().query(`
    SELECT r.department_id, r.mentor_user_id AS user_id, COUNT(*) AS n,
           MAX(CASE WHEN tp.code LIKE 'GPHN[_]BS%' OR tp.code LIKE 'GPHN[_]YS%' THEN 1 ELSE 0 END) AS doctor
    FROM enrollment_rotations r
    JOIN course_enrollments e ON e.id = r.enrollment_id
    JOIN training_programs tp ON tp.id = e.program_id
    JOIN users u ON u.id = r.mentor_user_id AND u.is_active = 1
    WHERE r.department_id IS NOT NULL
    GROUP BY r.department_id, r.mentor_user_id
    ORDER BY n DESC;
    SELECT u.id AS user_id, u.department_id, COALESCE(sl.qualification, q.name) AS qualification
    FROM users u
    JOIN staff_practice_licenses sl ON sl.user_id = u.id AND sl.license_no IS NOT NULL
    LEFT JOIN qualifications q ON q.id = u.qualification_id
    WHERE u.is_active = 1 AND u.department_id IS NOT NULL;`);
	const byDept = new Map();
	const add = (dept, id) => {
		const list = byDept.get(dept) ?? [];
		if (!list.includes(id)) list.push(id);
		byDept.set(dept, list);
	};
	for (const h of r.recordsets[0]) if (!!h.doctor === doctor) add(h.department_id, h.user_id);
	for (const u of r.recordsets[1])
		if (isDoctorQualification(u.qualification) === doctor) add(u.department_id, u.user_id);
	return byDept;
};

// Phần chính của arrange — không phát sự kiện (arrangeCourse phát 1 lần cho cả loạt).
const arrangeOne = async (
	enrollmentId,
	{ startDate = null, replace = false, firstLessonId = null, carryOver = false } = {},
	actorId,
) => {
	const pool = await getPool();
	const e = (
		await pool.request().input('id', sql.VarChar(20), enrollmentId).query(`
      SELECT e.id, e.status, e.program_id, e.trainee_id, e.practice_code, e.start_date, t.legacy_code,
             tp.code AS program_code, tp.duration AS program_duration
      FROM course_enrollments e
      JOIN trainees t ON t.id = e.trainee_id
      LEFT JOIN training_programs tp ON tp.id = e.program_id
      WHERE e.id = @id`)
	).recordset[0];
	if (!e) throw httpError(404, 'Không tìm thấy đăng ký.');
	if (e.status !== 'approved') throw httpError(400, 'Duyệt hồ sơ trước khi xếp lịch thực hành.');
	if (!e.program_id) throw httpError(400, 'Hồ sơ chưa chọn chương trình.');

	await buildTemplates([e.program_id], actorId);
	const carried = carryOver ? await rotationService.carryOver(enrollmentId, actorId) : 0;
	// 409 nếu đã có vòng mà không replace; replace giữ vòng đã có kết quả
	await rotationService.generate(enrollmentId, { replace: replace || carried > 0 }, actorId);
	const kept = (
		await pool
			.request()
			.input('id', sql.VarChar(20), enrollmentId)
			.query(
				"SELECT id, start_date, end_date FROM enrollment_rotations WHERE enrollment_id = @id AND result <> 'pending' ORDER BY start_date, seq",
			)
	).recordset.map((k) => ({ id: k.id, start_date: day(k.start_date), end_date: day(k.end_date) }));
	const keptEnd = kept
		.map((k) => k.end_date)
		.filter(Boolean)
		.sort()
		.at(-1);
	const afterKept = keptEnd && new Date(Date.parse(keptEnd) + 86400000).toISOString().slice(0, 10);
	const start = day(startDate) || afterKept || day(e.start_date) || day(todayVN());

	const [rows, rounds, busyRes, mentors] = await Promise.all([
		pool
			.request()
			.input('id', sql.VarChar(20), enrollmentId)
			.query(
				"SELECT id, lesson_id, duration_text, department_id FROM enrollment_rotations WHERE enrollment_id = @id AND result = 'pending' ORDER BY seq",
			),
		rotationService.loadRounds(pool, e.program_id),
		// Vòng của học viên khác còn đang / sẽ học từ ngày bắt đầu trở đi
		pool.request().input('id', sql.VarChar(20), enrollmentId).input('start', sql.Date, start)
			.query(`
        SELECT r.department_id, r.mentor_user_id, r.start_date, r.end_date
        FROM enrollment_rotations r
        JOIN course_enrollments e ON e.id = r.enrollment_id
        WHERE r.enrollment_id <> @id AND r.start_date IS NOT NULL AND r.end_date >= @start
          AND r.result <> 'fail' AND ISNULL(e.progress_status, 'in_progress') <> 'dropped'`),
		loadMentorCandidates(pool, isDoctorProgram(e.program_code)),
	]);
	const busy = busyRes.recordset.map((b) => ({
		...b,
		start_date: day(b.start_date),
		end_date: day(b.end_date),
	}));
	const plan = arrangeRotations(
		rows.recordset,
		new Map(rounds.map((x) => [x.id, x])),
		start,
		busy,
		firstLessonId,
	);
	if (!plan)
		throw httpError(
			400,
			'Có vòng chưa có thời lượng — nhập thời lượng vòng ở màn Chương trình đào tạo.',
		);

	// Vòng đã học đứng trước theo ngày, vòng mới xếp nối sau
	for (const [i, k] of kept.entries())
		await pool
			.request()
			.input('id', sql.VarChar(20), k.id)
			.input('seq', sql.Int, (i + 1) * 10)
			.query('UPDATE enrollment_rotations SET seq = @seq WHERE id = @id');
	for (const [j, p] of plan.entries()) {
		const i = kept.length + j;
		const mentorId = p.department_id
			? pickMentor(mentors.get(p.department_id) ?? [], busy, p.start_date, p.end_date)
			: null;
		const snap = mentorId ? await rotationService.mentorSnapshot(pool, mentorId) : {};
		const req = pool
			.request()
			.input('id', sql.VarChar(20), p.id)
			.input('seq', sql.Int, (i + 1) * 10)
			.input('start_date', sql.Date, p.start_date)
			.input('end_date', sql.Date, p.end_date)
			.input('department_id', sql.VarChar(20), p.department_id)
			.input('mentor_user_id', sql.VarChar(20), mentorId)
			.input('actor_id', sql.VarChar(20), actorId);
		for (const [field, type] of Object.entries(rotationService.SNAPSHOT_TYPES))
			req.input(field, type, snap[field] ?? null);
		await req.query(`
      UPDATE enrollment_rotations
      SET seq = @seq, start_date = @start_date, end_date = @end_date,
          department_id = @department_id, department_name = (SELECT name FROM departments WHERE id = @department_id),
          mentor_user_id = @mentor_user_id,
          ${Object.keys(rotationService.SNAPSHOT_TYPES)
						.map((f) => `${f} = @${f}`)
						.join(', ')},
          updated_at = GETDATE(), updated_by = @actor_id
      WHERE id = @id`);
	}

	const placed = await pool.request().input('id', sql.VarChar(20), enrollmentId).query(`
    SELECT r.department_name, r.round_title, ISNULL(pl.allow_split, 0) AS allow_split
    FROM enrollment_rotations r LEFT JOIN program_lessons pl ON pl.id = r.lesson_id
    WHERE r.enrollment_id = @id ORDER BY r.seq`);
	// Lĩnh vực / hình thức hành nghề: cách ghi hay gặp nhất của cùng chương trình trong sổ
	const usual = (
		await pool
			.request()
			.input('program_id', sql.VarChar(20), e.program_id)
			.input('id', sql.VarChar(20), enrollmentId).query(`
        SELECT TOP 1 professional_field, practice_form FROM course_enrollments
        WHERE program_id = @program_id AND id <> @id AND professional_field IS NOT NULL AND practice_form IS NOT NULL
        GROUP BY professional_field, practice_form ORDER BY COUNT(*) DESC`)
	).recordset[0];
	const { code, number } = e.practice_code
		? { code: e.practice_code, number: null }
		: await practiceCodeFor(pool, e);
	const first = kept.find((k) => k.start_date)?.start_date ?? plan[0]?.start_date ?? start;
	const last = plan.at(-1)?.end_date ?? keptEnd ?? null;
	// ponytail: mã lấy theo số lớn nhất lúc chạy — 2 người bấm cùng lúc có thể trùng (UQ_enroll_practice_code chặn, bấm lại là xong).
	await pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.input('trainee_id', sql.VarChar(20), e.trainee_id)
		.input('number', sql.NVarChar(50), number != null ? String(number) : null)
		.input('practice_code', sql.NVarChar(30), code)
		.input('professional_field', sql.NVarChar(200), usual?.professional_field ?? null)
		.input('practice_form', sql.NVarChar(300), usual?.practice_form ?? null)
		.input('total_duration', sql.NVarChar(50), e.program_duration || describeSpan(first, last))
		.input('start_date', sql.Date, first)
		.input('end_date', sql.Date, last)
		.input('practice_location', sql.NVarChar(500), practiceLocation(placed.recordset))
		.input('actor_id', sql.VarChar(20), actorId).query(`
      UPDATE course_enrollments
      SET practice_code = @practice_code,
          professional_field = ISNULL(professional_field, @professional_field),
          practice_form = ISNULL(practice_form, @practice_form),
          total_duration = ISNULL(total_duration, @total_duration),
          start_date = @start_date, end_date = @end_date, practice_location = @practice_location,
          updated_at = GETDATE(), updated_by = @actor_id
      WHERE id = @id;
      UPDATE trainees SET legacy_code = @number WHERE id = @trainee_id AND legacy_code IS NULL AND @number IS NOT NULL;`);
	return { rotations: plan.length };
};

const arrange = async (enrollmentId, opts, actorId) => {
	const out = await arrangeOne(enrollmentId, opts, actorId);
	notify();
	return out;
};

/** Tự xếp mọi hồ sơ đã duyệt, đang học của khóa chưa có vòng, lần lượt theo ngày bắt đầu (bỏ hồ sơ đã qua ngày kết thúc). */
const arrangeCourse = async (courseId, actorId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('course_id', sql.VarChar(20), courseId)
		.input('today', sql.Date, todayVN()).query(`
    SELECT e.id, e.start_date, e.practice_code, t.full_name
    FROM course_enrollments e JOIN trainees t ON t.id = e.trainee_id
    WHERE e.course_id = @course_id AND e.program_id IS NOT NULL AND e.status = 'approved'
      AND ISNULL(e.progress_status, 'in_progress') = 'in_progress'
      AND (e.end_date IS NULL OR e.end_date >= @today)
      AND NOT EXISTS (SELECT 1 FROM enrollment_rotations r WHERE r.enrollment_id = e.id)
    ORDER BY e.start_date, e.registered_at`);
	let arranged = 0;
	const failed = [];
	for (const e of r.recordset) {
		try {
			await arrangeOne(e.id, { startDate: e.start_date }, actorId);
			arranged++;
		} catch (err) {
			failed.push(`${e.practice_code || e.full_name}: ${err.message}`);
		}
	}
	if (arranged) notify();
	return { arranged, failed };
};

// Job: hồ sơ đã qua ngày kết thúc, có vòng, mọi vòng đã có kết quả (người hướng dẫn
// chưa đánh giá thì chưa coi là xong) và không còn vòng trượt chưa học lại ⇒ hoàn thành.
const completeFinished = async () => {
	const pool = await getPool();
	const r = await pool.request().input('today', sql.Date, todayVN()).query(`
    UPDATE e SET progress_status = 'completed', progress_date = e.end_date, updated_at = GETDATE()
    FROM course_enrollments e
    WHERE e.status = 'approved' AND ISNULL(e.progress_status, 'in_progress') = 'in_progress'
      AND e.end_date < @today
      AND EXISTS (SELECT 1 FROM enrollment_rotations r WHERE r.enrollment_id = e.id)
      AND NOT EXISTS (SELECT 1 FROM enrollment_rotations p WHERE p.enrollment_id = e.id AND p.result = 'pending')
      AND NOT EXISTS (
        SELECT 1 FROM enrollment_rotations f
        WHERE f.enrollment_id = e.id AND f.result = 'fail'
          AND NOT EXISTS (SELECT 1 FROM enrollment_rotations x
                          WHERE x.enrollment_id = e.id AND x.lesson_id = f.lesson_id AND x.attempt_no > f.attempt_no));
    SELECT @@ROWCOUNT AS n;`);
	const n = r.recordset[0]?.n ?? 0;
	if (n) {
		logger.info(`[job:practice_complete] ${n} hồ sơ thực hành chuyển "Hoàn thành".`);
		notify();
	}
	return n;
};

module.exports = {
	buildTemplates,
	arrange,
	arrangeOne,
	arrangeCourse,
	completeFinished,
	codeSuffix,
};
