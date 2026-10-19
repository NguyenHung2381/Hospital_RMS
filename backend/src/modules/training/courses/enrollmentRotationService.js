/**
 * enrollmentRotationService.js — vòng thực hành GPHN của 1 lượt ghi danh: khoa,
 * ngày, người hướng dẫn (NHD) từng vòng. Xem 2026-11-11_enrollment_rotations.
 *   - generate: sinh vòng từ bài học 'rotation' của chương trình đã chọn.
 *   - schedule: xếp lịch nối tiếp từ 1 ngày bắt đầu (rotationPlanner).
 *   - update: đổi khoa / ngày / NHD (chụp lại thông tin NHD) / kết quả.
 *   - retake: học lại vòng không đạt (dòng mới, attempt_no + 1).
 * Danh sách trả kèm cảnh báo từng dòng (không chặn).
 */
const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { httpError } = require('../../../utils/httpError');
const { formatDuration } = require('../../../utils/trainingDuration');
const systemSettingService = require('../../settings/systemSettingService');
const { planSchedule, describeSpan, findWarnings } = require('./rotationPlanner');

const SEQ_STEP = 10;
const RESULTS = ['pending', 'pass', 'fail'];
const newId = "'VR' + LEFT(REPLACE(NEWID(),'-',''), 18)";

const notify = () => broadcast('update', { entity: 'course_enrollment' });

const maxMentorLoad = async () => {
	const n = parseInt(
		String(await systemSettingService.getValue('PRACTICE_MENTOR_MAX_TRAINEES', '5')),
		10,
	);
	return Number.isFinite(n) && n > 0 ? n : 5;
};

const getEnrollment = async (pool, enrollmentId) => {
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.query('SELECT id, program_id, start_date, end_date FROM course_enrollments WHERE id = @id');
	if (!r.recordset[0]) throw httpError(404, 'Không tìm thấy đăng ký.');
	return r.recordset[0];
};

// Vòng (bài học 'rotation') của chương trình + khoa được chọn của từng vòng.
const loadRounds = async (pool, programId) => {
	const r = await pool.request().input('program_id', sql.VarChar(20), programId || '').query(`
    SELECT pl.id, pl.code, pl.title, pl.duration_value, pl.duration_unit, pl.allow_split, lp.display_order,
           (SELECT STRING_AGG(ld.department_id, ',') WITHIN GROUP (ORDER BY ld.display_order)
              FROM lesson_departments ld WHERE ld.lesson_id = pl.id) AS department_ids
    FROM lesson_programs lp
    JOIN program_lessons pl ON pl.id = lp.lesson_id
    WHERE lp.program_id = @program_id AND pl.lesson_kind = 'rotation'
    ORDER BY lp.display_order, pl.title
  `);
	return r.recordset.map((x) => ({
		...x,
		department_ids: x.department_ids ? x.department_ids.split(',') : [],
	}));
};

const list = async (enrollmentId) => {
	const pool = await getPool();
	const enrollment = await getEnrollment(pool, enrollmentId);
	const [rows, loads, rounds, maxLoad] = await Promise.all([
		pool.request().input('id', sql.VarChar(20), enrollmentId).query(`
      SELECT r.*, pl.code AS round_code, pl.allow_split, pl.duration_value AS round_duration_value,
             pl.duration_unit AS round_duration_unit, d.name AS current_department_name
      FROM enrollment_rotations r
      LEFT JOIN program_lessons pl ON pl.id = r.lesson_id
      LEFT JOIN departments d ON d.id = r.department_id
      WHERE r.enrollment_id = @id
      ORDER BY r.seq, r.created_at
    `),
		// Số học viên KHÁC mà NHD đang kèm trùng thời gian với từng vòng
		pool.request().input('id', sql.VarChar(20), enrollmentId).query(`
      SELECT r.id, COUNT(DISTINCT o.enrollment_id) AS load
      FROM enrollment_rotations r
      JOIN enrollment_rotations o
        ON o.mentor_user_id = r.mentor_user_id AND o.enrollment_id <> r.enrollment_id
       AND o.result = 'pending' AND o.start_date <= r.end_date AND o.end_date >= r.start_date
      WHERE r.enrollment_id = @id AND r.mentor_user_id IS NOT NULL
      GROUP BY r.id
    `),
		loadRounds(pool, enrollment.program_id),
		maxMentorLoad(),
	]);
	const allowedDepartments = new Map(rounds.map((x) => [x.id, x.department_ids]));
	const warnings = findWarnings(rows.recordset, {
		enrollment,
		allowedDepartments,
		mentorLoad: new Map(loads.recordset.map((x) => [x.id, x.load])),
		maxLoad,
	});
	return {
		rows: rows.recordset.map((r) => ({
			...r,
			allowed_department_ids: allowedDepartments.get(r.lesson_id) ?? [],
			warnings: warnings.get(r.id) ?? [],
		})),
		rounds,
		max_mentor_load: maxLoad,
	};
};

// Sinh vòng từ chương trình. Đã có vòng thì chỉ sinh lại khi replace=true (xoá hết vòng cũ).
const generate = async (enrollmentId, { replace = false } = {}, actorId) => {
	const pool = await getPool();
	const enrollment = await getEnrollment(pool, enrollmentId);
	if (!enrollment.program_id) throw httpError(400, 'Hồ sơ chưa chọn chương trình.');
	const rounds = await loadRounds(pool, enrollment.program_id);
	if (!rounds.length) throw httpError(400, 'Chương trình chưa có vòng thực hành nào.');
	const existing = await pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.query('SELECT COUNT(*) AS n FROM enrollment_rotations WHERE enrollment_id = @id');
	if (existing.recordset[0].n && !replace)
		throw httpError(409, 'Hồ sơ đã có vòng thực hành — chọn "Sinh lại" để thay toàn bộ.');

	if (replace)
		await pool
			.request()
			.input('id', sql.VarChar(20), enrollmentId)
			.query('DELETE FROM enrollment_rotations WHERE enrollment_id = @id');
	for (const [i, round] of rounds.entries()) {
		// Vòng chỉ có 1 khoa thì gán sẵn khoa đó
		const onlyDept = round.department_ids.length === 1 ? round.department_ids[0] : null;
		await pool
			.request()
			.input('enrollment_id', sql.VarChar(20), enrollmentId)
			.input('lesson_id', sql.VarChar(20), round.id)
			.input('round_title', sql.NVarChar(255), round.title)
			.input('seq', sql.Int, (i + 1) * SEQ_STEP)
			.input('department_id', sql.VarChar(20), onlyDept)
			// Vòng chia nhiều khoa: để trống ⇒ xếp lịch chia đều thời lượng vòng cho số khoa
			.input(
				'duration_text',
				sql.NVarChar(50),
				round.allow_split ? null : formatDuration(round.duration_value, round.duration_unit),
			)
			.input('actor_id', sql.VarChar(20), actorId).query(`
        INSERT INTO enrollment_rotations (id, enrollment_id, lesson_id, round_title, seq, department_id, department_name, duration_text, created_by)
        VALUES (${newId}, @enrollment_id, @lesson_id, @round_title, @seq, @department_id,
                (SELECT name FROM departments WHERE id = @department_id), @duration_text, @actor_id);
      `);
	}
	notify();
	return list(enrollmentId);
};

// Thêm 1 khoa nữa cho vòng chia nhiều khoa (chuyên khoa lẻ) — chèn ngay sau dòng cuối của vòng đó.
const addSegment = async (enrollmentId, lessonId, actorId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('enrollment_id', sql.VarChar(20), enrollmentId)
		.input('lesson_id', sql.VarChar(20), lessonId)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(
			`
      DECLARE @after INT = (SELECT MAX(seq) FROM enrollment_rotations WHERE enrollment_id = @enrollment_id AND lesson_id = @lesson_id);
      IF @after IS NULL THROW 51010, N'Vòng này chưa có trong hồ sơ.', 1;
      UPDATE enrollment_rotations SET seq = seq + 1 WHERE enrollment_id = @enrollment_id AND seq > @after;
      INSERT INTO enrollment_rotations (id, enrollment_id, lesson_id, round_title, seq, created_by)
      SELECT TOP 1 ${newId}, @enrollment_id, @lesson_id, round_title, @after + 1, @actor_id
      FROM enrollment_rotations WHERE enrollment_id = @enrollment_id AND lesson_id = @lesson_id;
    `,
		)
		.catch((err) => {
			if (err.number === 51010) throw httpError(400, 'Vòng này chưa có trong hồ sơ.');
			throw err;
		});
	notify();
	return r.rowsAffected;
};

// Bản chụp NHD từ hồ sơ nhân sự + CCHN (cùng nguồn với GET /staff-licenses/mentors).
const mentorSnapshot = async (pool, userId) => {
	const r = await pool.request().input('uid', sql.VarChar(20), userId).query(`
    SELECT u.id, u.full_name, u.staff_number, u.date_of_birth, u.gender, u.phone_number,
           COALESCE(sl.qualification, q.name) AS qualification,
           sl.license_no, sl.issued_date, COALESCE(sl.practice_scope, sl.adjusted_scope) AS practice_scope
    FROM users u
    LEFT JOIN staff_practice_licenses sl ON sl.user_id = u.id
    LEFT JOIN qualifications q ON q.id = u.qualification_id
    WHERE u.id = @uid
  `);
	const u = r.recordset[0];
	if (!u) throw httpError(404, 'Không tìm thấy người hướng dẫn.');
	return {
		mentor_name: u.full_name,
		mentor_salutation: u.gender === 'male' ? 'ông' : u.gender === 'female' ? 'bà' : null,
		mentor_staff_no: u.staff_number != null ? String(u.staff_number) : null,
		mentor_dob: u.date_of_birth,
		mentor_qualification: u.qualification,
		mentor_license_no: u.license_no,
		mentor_license_date: u.issued_date,
		mentor_phone: u.phone_number,
		mentor_scope: u.practice_scope,
	};
};

const SNAPSHOT_TYPES = {
	mentor_name: sql.NVarChar(150),
	mentor_salutation: sql.NVarChar(10),
	mentor_staff_no: sql.NVarChar(20),
	mentor_dob: sql.Date,
	mentor_qualification: sql.NVarChar(200),
	mentor_license_no: sql.NVarChar(50),
	mentor_license_date: sql.Date,
	mentor_phone: sql.NVarChar(30),
	mentor_scope: sql.NVarChar(1000),
};

const ROW_FIELDS = {
	start_date: sql.Date,
	end_date: sql.Date,
	duration_text: sql.NVarChar(50),
	// ông/bà sửa tay được khi hồ sơ nhân sự chưa có giới tính
	mentor_salutation: sql.NVarChar(10),
	result: sql.VarChar(10),
	note: sql.NVarChar(500),
};

const update = async (rotationId, data, actorId) => {
	if (data.result !== undefined && !RESULTS.includes(data.result))
		throw httpError(400, 'Kết quả không hợp lệ');
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool
		.request()
		.input('id', sql.VarChar(20), rotationId)
		.input('actor_id', sql.VarChar(20), actorId);
	const changingMentor = data.mentor_user_id !== undefined;
	for (const [field, type] of Object.entries(ROW_FIELDS)) {
		if (data[field] === undefined) continue;
		// Đổi NHD cùng lúc: ông/bà ghi ở khối bản chụp bên dưới (giá trị nhập tay được ưu tiên)
		if (changingMentor && field in SNAPSHOT_TYPES) continue;
		sets.push(`${field} = @${field}`);
		req.input(field, type, data[field] === '' ? null : data[field]);
	}
	// Đổi ngày mà không ghi thời lượng ⇒ tự ghi lại chữ thời lượng theo ngày
	if (data.duration_text === undefined && data.start_date && data.end_date) {
		sets.push('duration_text = @auto_duration');
		req.input('auto_duration', sql.NVarChar(50), describeSpan(data.start_date, data.end_date));
	}
	if (data.department_id !== undefined) {
		sets.push('department_id = @department_id');
		sets.push('department_name = (SELECT name FROM departments WHERE id = @department_id)');
		req.input('department_id', sql.VarChar(20), data.department_id || null);
	}
	if (changingMentor) {
		sets.push('mentor_user_id = @mentor_user_id');
		req.input('mentor_user_id', sql.VarChar(20), data.mentor_user_id || null);
		const snap = data.mentor_user_id ? await mentorSnapshot(pool, data.mentor_user_id) : {};
		for (const [field, type] of Object.entries(SNAPSHOT_TYPES)) {
			sets.push(`${field} = @${field}`);
			const manual =
				data.mentor_user_id && data[field] !== undefined ? data[field] || null : undefined;
			req.input(field, type, manual !== undefined ? manual : (snap[field] ?? null));
		}
	}
	const r = await req
		.query(
			`UPDATE enrollment_rotations SET ${sets.join(', ')} WHERE id = @id; SELECT @@ROWCOUNT AS n;`,
		)
		.catch((err) => {
			if (String(err.message).includes('CHK_enrrot_dates'))
				throw httpError(400, 'Ngày kết thúc phải sau ngày bắt đầu.');
			throw err;
		});
	if (!r.recordset[0]?.n) throw httpError(404, 'Không tìm thấy vòng thực hành.');
	notify();
};

// Chụp lại thông tin NHD hiện tại (sau khi CCHN của NHD được cập nhật).
const refreshMentor = async (rotationId, actorId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), rotationId)
		.query('SELECT mentor_user_id FROM enrollment_rotations WHERE id = @id');
	const uid = r.recordset[0]?.mentor_user_id;
	if (!uid) throw httpError(400, 'Vòng này chưa có người hướng dẫn.');
	await update(rotationId, { mentor_user_id: uid }, actorId);
};

// Học lại vòng: đánh dấu dòng hiện tại "không đạt", thêm dòng mới cùng vòng/khoa ngay sau.
const retake = async (rotationId, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), rotationId)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(
			`
      DECLARE @enrollment_id VARCHAR(20), @seq INT;
      SELECT @enrollment_id = enrollment_id, @seq = seq FROM enrollment_rotations WHERE id = @id;
      IF @enrollment_id IS NULL THROW 51011, N'Không tìm thấy vòng thực hành.', 1;
      UPDATE enrollment_rotations SET result = 'fail', updated_at = GETDATE(), updated_by = @actor_id WHERE id = @id;
      UPDATE enrollment_rotations SET seq = seq + 1 WHERE enrollment_id = @enrollment_id AND seq > @seq;
      INSERT INTO enrollment_rotations (id, enrollment_id, lesson_id, round_title, seq, department_id, department_name,
                                        duration_text, attempt_no, note, created_by)
      SELECT ${newId}, enrollment_id, lesson_id, round_title, @seq + 1, department_id, department_name,
             duration_text, attempt_no + 1, N'Học lại vòng', @actor_id
      FROM enrollment_rotations WHERE id = @id;
    `,
		)
		.catch((err) => {
			if (err.number === 51011) throw httpError(404, 'Không tìm thấy vòng thực hành.');
			throw err;
		});
	notify();
};

const remove = async (rotationId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), rotationId)
		.query('DELETE FROM enrollment_rotations WHERE id = @id');
	notify();
};

// Xếp lịch toàn bộ vòng nối tiếp từ startDate (ghi đè ngày cũ). Hồ sơ chưa có
// ngày bắt đầu/kết thúc thì lấy theo lịch vừa xếp.
const schedule = async (enrollmentId, startDate, actorId) => {
	if (!/^\d{4}-\d{2}-\d{2}/.test(String(startDate || '')))
		throw httpError(400, 'Cần ngày bắt đầu.');
	const pool = await getPool();
	const enrollment = await getEnrollment(pool, enrollmentId);
	const [rows, rounds] = await Promise.all([
		pool
			.request()
			.input('id', sql.VarChar(20), enrollmentId)
			.query(
				'SELECT id, lesson_id, duration_text FROM enrollment_rotations WHERE enrollment_id = @id ORDER BY seq, created_at',
			),
		loadRounds(pool, enrollment.program_id),
	]);
	const plan = planSchedule(rows.recordset, new Map(rounds.map((x) => [x.id, x])), startDate);
	for (const p of plan) {
		await pool
			.request()
			.input('id', sql.VarChar(20), p.id)
			.input('start_date', sql.Date, p.start_date)
			.input('end_date', sql.Date, p.end_date)
			.input('actor_id', sql.VarChar(20), actorId).query(`
        UPDATE enrollment_rotations SET start_date = @start_date, end_date = @end_date,
               updated_at = GETDATE(), updated_by = @actor_id
        WHERE id = @id`);
	}
	if (plan.length) {
		const first = plan[0].start_date;
		const last = plan[plan.length - 1].end_date;
		await pool
			.request()
			.input('id', sql.VarChar(20), enrollmentId)
			.input('start_date', sql.Date, first)
			.input('end_date', sql.Date, last)
			.input('total', sql.NVarChar(50), describeSpan(first, last)).query(`
        UPDATE course_enrollments
        SET start_date = ISNULL(start_date, @start_date), end_date = ISNULL(end_date, @end_date),
            total_duration = ISNULL(total_duration, @total)
        WHERE id = @id`);
	}
	notify();
	return { scheduled: plan.length, skipped: rows.recordset.length - plan.length };
};

module.exports = { list, generate, addSegment, update, refreshMentor, retake, remove, schedule };
