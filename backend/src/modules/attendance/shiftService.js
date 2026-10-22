const { getPool, sql, withTransaction } = require('../../config/db');
const { broadcast } = require('../events/eventService');
const {
	validateShift,
	normalizePatternDays,
	periodOn,
	DATE_RE,
} = require('../../utils/attendanceShift');
const { httpError } = require('../../utils/httpError');
const { scopeOf } = require('../../permissions/authz');
const { todayKeyVN } = require('../../utils/vnDate');

// Ca, mẫu ca tuần, phân ca theo ngày (2026-10-30_attendance_shifts.sql) cho chấm công
// HỌC VIÊN theo khóa đào tạo (2026-11-30_trainee_attendance.sql): mẫu ca tuần gán theo
// khóa (courses.shift_pattern_id), phân ca theo ngày gán cho tài khoản học viên.
// Logic chọn ca khi chấm công ở utils/attendanceShift.js.

const changed = () => broadcast('update', { entity: 'work_shifts' });

const dateKey = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
const parsePattern = (row) => row && { ...row, days: normalizePatternDays(JSON.parse(row.days)) };

// Phạm vi khoa của lượt cấp staff_attendance:<action> (permissions/scopes.js):
// undefined = toàn viện; còn lại = mã khoa duy nhất được thấy/sửa (null khi
// người thao tác chưa thuộc khoa nào ⇒ không ai). Khoa của học viên = trainees.department_id.
const deptLimit = (actor, action) =>
	scopeOf(actor, 'staff_attendance', action) === 'department'
		? (actor.department_id ?? null)
		: undefined;

// ─── Ca làm ──────────────────────────────────────────────────────────────────
const listShifts = async () => {
	const pool = await getPool();
	return (
		await pool
			.request()
			.query('SELECT * FROM work_shifts ORDER BY is_active DESC, start_time, name')
	).recordset;
};

const shiftInput = (b) => ({
	name: String(b.name ?? '').trim(),
	code: String(b.code ?? '').trim(),
	color: b.color ? String(b.color).slice(0, 20) : null,
	start_time: b.start_time,
	end_time: b.end_time,
	checkin_before_min: Number(b.checkin_before_min),
	checkout_after_min: Number(b.checkout_after_min),
	grace_min: Number(b.grace_min),
	is_active: b.is_active !== false,
});

const saveShift = async (id, body) => {
	const s = shiftInput(body);
	const invalid = validateShift(s);
	if (invalid) throw httpError(400, invalid);
	const pool = await getPool();
	const dup = (
		await pool
			.request()
			.input('code', sql.NVarChar(10), s.code)
			.input('id', sql.Int, id ?? 0)
			.query('SELECT name FROM work_shifts WHERE code = @code AND id <> @id')
	).recordset[0];
	if (dup) throw httpError(409, `Ký hiệu "${s.code}" đã dùng cho ca "${dup.name}"`);
	const req = pool
		.request()
		.input('name', sql.NVarChar(100), s.name)
		.input('code', sql.NVarChar(10), s.code)
		.input('color', sql.VarChar(20), s.color)
		.input('start_time', sql.Char(5), s.start_time)
		.input('end_time', sql.Char(5), s.end_time)
		.input('before', sql.Int, s.checkin_before_min)
		.input('after', sql.Int, s.checkout_after_min)
		.input('grace', sql.Int, s.grace_min)
		.input('active', sql.Bit, s.is_active);
	const row = id
		? (
				await req.input('id', sql.Int, id).query(`
          UPDATE work_shifts SET name = @name, code = @code, color = @color, start_time = @start_time,
            end_time = @end_time, checkin_before_min = @before, checkout_after_min = @after, grace_min = @grace,
            is_active = @active, updated_at = SYSUTCDATETIME()
          OUTPUT inserted.* WHERE id = @id
        `)
			).recordset[0]
		: (
				await req.query(`
          INSERT INTO work_shifts (name, code, color, start_time, end_time, checkin_before_min, checkout_after_min, grace_min, is_active)
          OUTPUT inserted.*
          VALUES (@name, @code, @color, @start_time, @end_time, @before, @after, @grace, @active)
        `)
			).recordset[0];
	if (!row) throw httpError(404, 'Không tìm thấy ca làm');
	changed();
	return row;
};

// Ca đã dùng trong mẫu tuần / bảng phân ca thì không xoá được (bảng chấm công lưu bản chụp giờ ca nên không ảnh hưởng)
const removeShift = async (id) => {
	const pool = await getPool();
	const inPattern = (
		await pool.request().query('SELECT name, days FROM shift_patterns')
	).recordset.find((p) =>
		Object.values(normalizePatternDays(JSON.parse(p.days))).some((ids) => ids.includes(id)),
	);
	if (inPattern)
		throw httpError(
			409,
			`Ca đang dùng trong mẫu "${inPattern.name}" — bỏ khỏi mẫu trước, hoặc chuyển ca sang "Ngừng dùng"`,
		);
	const used = (
		await pool
			.request()
			.input('id', sql.Int, id)
			.query('SELECT TOP 1 1 AS x FROM shift_assignments WHERE shift_id = @id')
	).recordset[0];
	if (used)
		throw httpError(
			409,
			'Ca đã được xếp trong bảng phân ca — chuyển ca sang "Ngừng dùng" thay vì xoá',
		);
	const { rowsAffected } = await pool
		.request()
		.input('id', sql.Int, id)
		.query('DELETE FROM work_shifts WHERE id = @id');
	if (!rowsAffected[0]) throw httpError(404, 'Không tìm thấy ca làm');
	changed();
};

// ─── Mẫu ca tuần ─────────────────────────────────────────────────────────────
const listPatterns = async () => {
	const pool = await getPool();
	const rows = (
		await pool.request().query(`
      SELECT p.*, (SELECT COUNT(*) FROM courses c WHERE c.shift_pattern_id = p.id AND c.status <> 'cancelled') AS course_count
      FROM shift_patterns p
      ORDER BY p.is_default DESC, p.name
    `)
	).recordset;
	return rows.map(parsePattern);
};

const savePattern = async (id, { name, days, is_default }) => {
	if (!String(name ?? '').trim()) throw httpError(400, 'Vui lòng nhập tên mẫu ca');
	const norm = normalizePatternDays(days);
	const ids = [...new Set(Object.values(norm).flat())];
	if (ids.length) {
		const pool = await getPool();
		const found = (
			await pool
				.request()
				.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
				.query('SELECT id FROM work_shifts WHERE id IN (SELECT value FROM OPENJSON(@ids))')
		).recordset.length;
		if (found !== ids.length) throw httpError(400, 'Mẫu có ca không tồn tại');
	}
	const row = await withTransaction(async (tx) => {
		// Bỏ mặc định cũ trước (UNIQUE index lọc is_default = 1)
		if (is_default)
			await new sql.Request(tx)
				.input('id', sql.Int, id ?? 0)
				.query('UPDATE shift_patterns SET is_default = 0 WHERE is_default = 1 AND id <> @id');
		const req = new sql.Request(tx)
			.input('name', sql.NVarChar(100), String(name).trim())
			.input('days', sql.NVarChar(sql.MAX), JSON.stringify(norm))
			.input('is_default', sql.Bit, !!is_default);
		return id
			? (
					await req.input('id', sql.Int, id).query(`
            UPDATE shift_patterns SET name = @name, days = @days, is_default = @is_default, updated_at = SYSUTCDATETIME()
            OUTPUT inserted.* WHERE id = @id
          `)
				).recordset[0]
			: (
					await req.query(`
            INSERT INTO shift_patterns (name, days, is_default) OUTPUT inserted.* VALUES (@name, @days, @is_default)
          `)
				).recordset[0];
	});
	if (!row) throw httpError(404, 'Không tìm thấy mẫu ca');
	changed();
	return parsePattern(row);
};

// Khóa đang dùng mẫu này tự về mẫu mặc định (FK courses không cascade — gỡ trước khi xoá)
const removePattern = async (id) => {
	const deleted = await withTransaction(async (tx) => {
		await new sql.Request(tx)
			.input('id', sql.Int, id)
			.query('UPDATE courses SET shift_pattern_id = NULL WHERE shift_pattern_id = @id');
		return (
			await new sql.Request(tx)
				.input('id', sql.Int, id)
				.query('DELETE FROM shift_patterns WHERE id = @id')
		).rowsAffected[0];
	});
	if (!deleted) throw httpError(404, 'Không tìm thấy mẫu ca');
	changed();
};

// Khóa học chưa huỷ (chọn khóa áp dụng mẫu ca); ended = đã qua ngày kết thúc
const listCourses = async () => {
	const pool = await getPool();
	return (
		await pool.request().input('today', sql.Date, todayKeyVN()).query(`
      SELECT c.id, c.name, c.start_date, c.end_date, c.is_rolling, c.shift_pattern_id,
             CAST(CASE WHEN c.is_rolling = 0 AND c.end_date < @today THEN 1 ELSE 0 END AS BIT) AS ended,
             (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id AND e.status = 'approved') AS trainee_count
      FROM courses c
      WHERE c.status <> 'cancelled'
      ORDER BY ended, c.start_date DESC, c.name
    `)
	).recordset.map((c) => ({
		...c,
		start_date: dateKey(c.start_date),
		end_date: dateKey(c.end_date),
	}));
};

// Đặt đúng danh sách khóa dùng mẫu `id`: khóa trong course_ids chuyển sang mẫu này,
// khóa đang ở mẫu này mà không có trong danh sách → về mẫu mặc định.
const setPatternCourses = async (id, courseIds) => {
	const pool = await getPool();
	const exists = (
		await pool
			.request()
			.input('id', sql.Int, id)
			.query('SELECT 1 AS x FROM shift_patterns WHERE id = @id')
	).recordset[0];
	if (!exists) throw httpError(404, 'Không tìm thấy mẫu ca');
	await withTransaction((tx) =>
		new sql.Request(tx)
			.input('id', sql.Int, id)
			.input('ids', sql.NVarChar(sql.MAX), JSON.stringify([...new Set(courseIds.map(String))]))
			.query(`
        UPDATE courses SET shift_pattern_id = NULL
        WHERE shift_pattern_id = @id AND id NOT IN (SELECT value FROM OPENJSON(@ids));
        UPDATE courses SET shift_pattern_id = @id WHERE id IN (SELECT value FROM OPENJSON(@ids));
      `),
	);
	changed();
};

// ─── Học viên theo khóa ──────────────────────────────────────────────────────
// Lượt học trong [from, to] của học viên có tài khoản: ghi danh 'approved', khóa chưa huỷ.
// Thời gian học = thời gian riêng của lượt ghi danh (khóa mở liên tục) hoặc của khóa;
// khóa thường chưa có ngày bắt đầu thì chưa tính. Ngày NULL = không giới hạn phía đó.
//   → [{ user_id, trainee_id, full_name, department_id, department_name,
//        course_id, course_name, shift_pattern_id, start_date, end_date }]
const traineePeriods = async ({ from, to, userId, departmentId }) => {
	const pool = await getPool();
	const req = pool.request().input('from', sql.Date, from).input('to', sql.Date, to);
	const where = [];
	if (userId) {
		req.input('user_id', sql.VarChar(20), userId);
		where.push('t.user_id = @user_id');
	}
	if (departmentId) {
		req.input('dept', sql.VarChar(20), String(departmentId));
		where.push('t.department_id = @dept');
	}
	const rows = (
		await req.query(`
      SELECT t.user_id, t.id AS trainee_id, t.full_name, t.department_id, d.name AS department_name,
             c.id AS course_id, c.name AS course_name, c.shift_pattern_id, p.start_date, p.end_date
      FROM course_enrollments e
      JOIN courses c ON c.id = e.course_id
      JOIN trainees t ON t.id = e.trainee_id
      JOIN users u ON u.id = t.user_id AND u.is_active = 1
      LEFT JOIN departments d ON d.id = t.department_id
      CROSS APPLY (SELECT ISNULL(e.start_date, c.start_date) AS start_date,
                          ISNULL(e.end_date, c.end_date) AS end_date) p
      WHERE e.status = 'approved' AND c.status <> 'cancelled'
        AND t.is_active = 1 AND t.hidden_at IS NULL
        AND (p.start_date IS NOT NULL OR c.is_rolling = 1)
        AND (p.start_date IS NULL OR p.start_date <= @to)
        AND (p.end_date IS NULL OR p.end_date >= @from)
        ${where.map((w) => `AND ${w}`).join(' ')}
      ORDER BY t.full_name, p.start_date DESC
    `)
	).recordset;
	return rows.map((r) => ({
		...r,
		start_date: dateKey(r.start_date),
		end_date: dateKey(r.end_date),
	}));
};

// Gom lượt học theo tài khoản học viên → [{ id: user_id, trainee_id, full_name, …, periods }]
const groupByTrainee = (periods) => {
	const map = new Map();
	for (const p of periods) {
		if (!map.has(p.user_id))
			map.set(p.user_id, {
				id: p.user_id,
				trainee_id: p.trainee_id,
				full_name: p.full_name,
				department_id: p.department_id,
				department_name: p.department_name,
				periods: [],
			});
		map.get(p.user_id).periods.push({
			course_id: p.course_id,
			course_name: p.course_name,
			shift_pattern_id: p.shift_pattern_id,
			start_date: p.start_date,
			end_date: p.end_date,
		});
	}
	return [...map.values()];
};

// (dateKey) → { course_id, course_name, pattern } | null: khóa đang học ngày đó + mẫu ca tuần
// của khóa (khóa chưa gán mẫu → mẫu mặc định, không có nữa → null = chấm tự do)
const courseResolver = (periods, patterns) => {
	const byId = new Map(patterns.map((p) => [p.id, p]));
	const fallback = patterns.find((p) => p.is_default) ?? null;
	return (date) => {
		const p = periodOn(periods, date);
		if (!p) return null;
		return {
			course_id: p.course_id,
			course_name: p.course_name,
			pattern: (p.shift_pattern_id && byId.get(p.shift_pattern_id)) || fallback,
		};
	};
};

// ─── Phân ca theo ngày ───────────────────────────────────────────────────────
// Dữ liệu cho lưới phân ca: học viên đang học trong khoảng ngày (kèm các lượt học) + phân ca;
// client tự ghép với mẫu ca tuần của khóa. Phân ca phạm vi khoa: chỉ học viên cùng khoa.
const getRoster = async ({ from, to }, actor) => {
	const limit = deptLimit(actor, 'roster');
	if (limit === null) return { users: [], assignments: [] };
	const pool = await getPool();
	const users = groupByTrainee(await traineePeriods({ from, to, departmentId: limit }));
	const assignments = (
		await pool
			.request()
			.input('from', sql.Date, from)
			.input('to', sql.Date, to)
			.query(
				'SELECT user_id, work_date, shift_id FROM shift_assignments WHERE work_date BETWEEN @from AND @to',
			)
	).recordset;
	const ids = new Set(users.map((u) => u.id));
	return {
		users,
		assignments: assignments
			.filter((a) => ids.has(a.user_id))
			.map((a) => ({ ...a, work_date: dateKey(a.work_date) })),
	};
};

const MAX_CELLS = 20000;

// Chỉ phân ca cho tài khoản học viên; phạm vi khoa: học viên phải cùng khoa với người thao tác.
const assertTrainees = async (userIds, limit) => {
	if (limit === null) throw httpError(403, 'Chỉ được phân ca cho học viên thuộc khoa của bạn');
	const req = (await getPool())
		.request()
		.input('users', sql.NVarChar(sql.MAX), JSON.stringify(userIds));
	if (limit !== undefined) req.input('dept', sql.VarChar(20), String(limit));
	const outside = (
		await req.query(`
      SELECT j.value AS id FROM OPENJSON(@users) j
      WHERE NOT EXISTS (SELECT 1 FROM trainees t WHERE t.user_id = j.value${limit !== undefined ? ' AND t.department_id = @dept' : ''})
    `)
	).recordset;
	if (!outside.length) return;
	if (limit === undefined) throw httpError(400, 'Chỉ phân ca được cho tài khoản học viên');
	throw httpError(403, 'Chỉ được phân ca cho học viên thuộc khoa của bạn');
};

// Đặt ô phân ca cho mọi cặp (học viên × ngày):
//   mode 'shifts'  → đúng các ca shift_ids   mode 'off' → nghỉ   mode 'pattern' → bỏ phân ca, theo mẫu tuần của khóa
const setRoster = async ({ user_ids, dates, mode, shift_ids = [] }, actor) => {
	const users = [...new Set(user_ids.map(String))];
	const days = [...new Set(dates)];
	if (!users.length || !days.length) throw httpError(400, 'Chọn ít nhất 1 học viên và 1 ngày');
	if (days.some((d) => !DATE_RE.test(d))) throw httpError(400, 'Ngày không hợp lệ');
	if (users.length * days.length > MAX_CELLS) throw httpError(400, `Tối đa ${MAX_CELLS} ô mỗi lần`);
	const shifts =
		mode === 'shifts' ? [...new Set(shift_ids.map(Number))] : mode === 'off' ? [null] : [];
	if (mode === 'shifts' && !shifts.length) throw httpError(400, 'Chọn ít nhất 1 ca');
	await assertTrainees(users, deptLimit(actor, 'roster'));
	await withTransaction(async (tx) => {
		const req = () =>
			new sql.Request(tx)
				.input('users', sql.NVarChar(sql.MAX), JSON.stringify(users))
				.input('dates', sql.NVarChar(sql.MAX), JSON.stringify(days));
		await req().query(`
      DELETE FROM shift_assignments
      WHERE user_id IN (SELECT value FROM OPENJSON(@users)) AND work_date IN (SELECT CAST(value AS DATE) FROM OPENJSON(@dates))
    `);
		if (!shifts.length) return;
		const shiftIds = shifts.filter((s) => s != null);
		if (shiftIds.length) {
			const found = (
				await new sql.Request(tx)
					.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(shiftIds))
					.query(
						'SELECT id FROM work_shifts WHERE is_active = 1 AND id IN (SELECT value FROM OPENJSON(@ids))',
					)
			).recordset.length;
			if (found !== shiftIds.length) throw httpError(400, 'Có ca không tồn tại hoặc đã ngừng dùng');
		}
		await req()
			.input('shifts', sql.NVarChar(sql.MAX), JSON.stringify(shifts))
			.input('actor', sql.VarChar(20), actor.id).query(`
        INSERT INTO shift_assignments (user_id, work_date, shift_id, updated_by)
        SELECT u.id, CAST(d.value AS DATE), TRY_CAST(s.value AS INT), @actor
        FROM users u
        CROSS JOIN OPENJSON(@dates) d
        CROSS JOIN OPENJSON(@shifts) s
        WHERE u.id IN (SELECT value FROM OPENJSON(@users))
      `);
	});
	broadcast('update', { entity: 'shift_assignments' });
	return { cells: users.length * days.length };
};

// ─── Dùng khi chấm công ──────────────────────────────────────────────────────
// Ca ngừng dùng không còn hiệu lực ở mẫu tuần lẫn bảng phân ca
const shiftsMap = async () =>
	new Map((await listShifts()).filter((s) => s.is_active).map((s) => [s.id, s]));

const assignmentsForUser = async (userId, from, to) => {
	const pool = await getPool();
	return (
		await pool
			.request()
			.input('user_id', sql.VarChar(20), userId)
			.input('from', sql.Date, from)
			.input('to', sql.Date, to)
			.query(
				'SELECT work_date, shift_id FROM shift_assignments WHERE user_id = @user_id AND work_date BETWEEN @from AND @to',
			)
	).recordset.map((a) => ({ ...a, work_date: dateKey(a.work_date) }));
};

// Lịch ca trong 1 ngày (bảng chấm công) của học viên cả viện hoặc 1 khoa: khóa đang học +
// mẫu ca tuần của khóa + phân ca ngày đó
const planForDate = async (date, departmentId) => {
	const pool = await getPool();
	const [periods, patterns, assignments, shifts] = await Promise.all([
		traineePeriods({ from: date, to: date, departmentId }),
		listPatterns(),
		pool
			.request()
			.input('date', sql.Date, date)
			.query('SELECT user_id, work_date, shift_id FROM shift_assignments WHERE work_date = @date'),
		shiftsMap(),
	]);
	return {
		trainees: groupByTrainee(periods),
		patterns,
		assignments: assignments.recordset.map((a) => ({ ...a, work_date: dateKey(a.work_date) })),
		shifts,
	};
};

module.exports = {
	deptLimit,
	listShifts,
	saveShift,
	removeShift,
	listPatterns,
	savePattern,
	removePattern,
	listCourses,
	setPatternCourses,
	traineePeriods,
	courseResolver,
	getRoster,
	setRoster,
	shiftsMap,
	assignmentsForUser,
	planForDate,
};
