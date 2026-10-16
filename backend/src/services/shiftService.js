const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');
const { validateShift, normalizePatternDays, DATE_RE } = require('../utils/attendanceShift');

// Ca làm việc, mẫu ca tuần, phân ca theo ngày (2026-10-30_attendance_shifts.sql).
// Logic chọn ca khi chấm công ở utils/attendanceShift.js.

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const changed = () => broadcast('update', { entity: 'work_shifts' });

const dateKey = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
const parsePattern = (row) => row && { ...row, days: normalizePatternDays(JSON.parse(row.days)) };

// Chạy fn(tx) trong 1 transaction
const inTx = async (fn) => {
	const pool = await getPool();
	const tx = new sql.Transaction(pool);
	await tx.begin();
	try {
		const result = await fn(tx);
		await tx.commit();
		return result;
	} catch (err) {
		await tx.rollback().catch(() => {});
		throw err;
	}
};

// ─── Ca làm ──────────────────────────────────────────────────────────────────
const listShifts = async () => {
	const pool = await getPool();
	return (await pool.request().query('SELECT * FROM work_shifts ORDER BY is_active DESC, start_time, name')).recordset;
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
		await pool.request().input('code', sql.NVarChar(10), s.code).input('id', sql.Int, id ?? 0)
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
	const inPattern = (await pool.request().query('SELECT name, days FROM shift_patterns')).recordset.find((p) =>
		Object.values(normalizePatternDays(JSON.parse(p.days))).some((ids) => ids.includes(id)),
	);
	if (inPattern) throw httpError(409, `Ca đang dùng trong mẫu "${inPattern.name}" — bỏ khỏi mẫu trước, hoặc chuyển ca sang "Ngừng dùng"`);
	const used = (await pool.request().input('id', sql.Int, id).query('SELECT TOP 1 1 AS x FROM shift_assignments WHERE shift_id = @id')).recordset[0];
	if (used) throw httpError(409, 'Ca đã được xếp trong bảng phân ca — chuyển ca sang "Ngừng dùng" thay vì xoá');
	const { rowsAffected } = await pool.request().input('id', sql.Int, id).query('DELETE FROM work_shifts WHERE id = @id');
	if (!rowsAffected[0]) throw httpError(404, 'Không tìm thấy ca làm');
	changed();
};

// ─── Mẫu ca tuần ─────────────────────────────────────────────────────────────
const listPatterns = async () => {
	const pool = await getPool();
	const rows = (
		await pool.request().query(`
      SELECT p.*, (SELECT COUNT(*) FROM users u WHERE u.shift_pattern_id = p.id) AS user_count
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
		const found = (await pool.request().input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
			.query('SELECT id FROM work_shifts WHERE id IN (SELECT value FROM OPENJSON(@ids))')).recordset.length;
		if (found !== ids.length) throw httpError(400, 'Mẫu có ca không tồn tại');
	}
	const row = await inTx(async (tx) => {
		// Bỏ mặc định cũ trước (UNIQUE index lọc is_default = 1)
		if (is_default)
			await new sql.Request(tx).input('id', sql.Int, id ?? 0).query('UPDATE shift_patterns SET is_default = 0 WHERE is_default = 1 AND id <> @id');
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

// Người đang dùng mẫu này tự về mẫu mặc định (FK ON DELETE SET NULL)
const removePattern = async (id) => {
	const pool = await getPool();
	const { rowsAffected } = await pool.request().input('id', sql.Int, id).query('DELETE FROM shift_patterns WHERE id = @id');
	if (!rowsAffected[0]) throw httpError(404, 'Không tìm thấy mẫu ca');
	changed();
};

// Tài khoản đang hoạt động (chọn người áp dụng mẫu / bảng phân ca)
const listUsers = async (departmentId) => {
	const pool = await getPool();
	const req = pool.request();
	let where = 'u.is_active = 1';
	if (departmentId) {
		req.input('dept', sql.VarChar(20), String(departmentId));
		where += ' AND u.department_id = @dept';
	}
	return (
		await req.query(`
      SELECT u.id, u.full_name, u.staff_number, u.shift_pattern_id, u.department_id, d.name AS department_name
      FROM users u LEFT JOIN departments d ON d.id = u.department_id
      WHERE ${where}
      ORDER BY u.full_name
    `)
	).recordset;
};

// Đặt đúng danh sách người dùng mẫu `id`: người trong user_ids chuyển sang mẫu này,
// người đang ở mẫu này mà không có trong danh sách → về mẫu mặc định.
const setPatternUsers = async (id, userIds) => {
	const pool = await getPool();
	const exists = (await pool.request().input('id', sql.Int, id).query('SELECT 1 AS x FROM shift_patterns WHERE id = @id')).recordset[0];
	if (!exists) throw httpError(404, 'Không tìm thấy mẫu ca');
	await inTx((tx) =>
		new sql.Request(tx)
			.input('id', sql.Int, id)
			.input('ids', sql.NVarChar(sql.MAX), JSON.stringify([...new Set(userIds.map(String))]))
			.query(`
        UPDATE users SET shift_pattern_id = NULL
        WHERE shift_pattern_id = @id AND id NOT IN (SELECT value FROM OPENJSON(@ids));
        UPDATE users SET shift_pattern_id = @id WHERE id IN (SELECT value FROM OPENJSON(@ids));
      `),
	);
	changed();
};

// ─── Phân ca theo ngày ───────────────────────────────────────────────────────
// Dữ liệu cho lưới phân ca: người + phân ca trong khoảng ngày; client tự ghép với mẫu tuần.
const getRoster = async ({ from, to, department_id }) => {
	const pool = await getPool();
	const users = await listUsers(department_id);
	const assignments = (
		await pool.request().input('from', sql.Date, from).input('to', sql.Date, to).query(`
      SELECT a.user_id, a.work_date, a.shift_id FROM shift_assignments a
      JOIN users u ON u.id = a.user_id AND u.is_active = 1
      WHERE a.work_date BETWEEN @from AND @to
    `)
	).recordset;
	const ids = new Set(users.map((u) => u.id));
	return {
		users,
		assignments: assignments.filter((a) => ids.has(a.user_id)).map((a) => ({ ...a, work_date: dateKey(a.work_date) })),
	};
};

const MAX_CELLS = 20000;

// Đặt ô phân ca cho mọi cặp (người × ngày):
//   mode 'shifts'  → đúng các ca shift_ids   mode 'off' → nghỉ   mode 'pattern' → bỏ phân ca, theo mẫu tuần
const setRoster = async ({ user_ids, dates, mode, shift_ids = [] }, actorId) => {
	const users = [...new Set(user_ids.map(String))];
	const days = [...new Set(dates)];
	if (!users.length || !days.length) throw httpError(400, 'Chọn ít nhất 1 người và 1 ngày');
	if (days.some((d) => !DATE_RE.test(d))) throw httpError(400, 'Ngày không hợp lệ');
	if (users.length * days.length > MAX_CELLS) throw httpError(400, `Tối đa ${MAX_CELLS} ô mỗi lần`);
	const shifts = mode === 'shifts' ? [...new Set(shift_ids.map(Number))] : mode === 'off' ? [null] : [];
	if (mode === 'shifts' && !shifts.length) throw httpError(400, 'Chọn ít nhất 1 ca');
	await inTx(async (tx) => {
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
			const found = (await new sql.Request(tx).input('ids', sql.NVarChar(sql.MAX), JSON.stringify(shiftIds))
				.query('SELECT id FROM work_shifts WHERE is_active = 1 AND id IN (SELECT value FROM OPENJSON(@ids))')).recordset.length;
			if (found !== shiftIds.length) throw httpError(400, 'Có ca không tồn tại hoặc đã ngừng dùng');
		}
		await req()
			.input('shifts', sql.NVarChar(sql.MAX), JSON.stringify(shifts))
			.input('actor', sql.VarChar(20), actorId)
			.query(`
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
const shiftsMap = async () => new Map((await listShifts()).filter((s) => s.is_active).map((s) => [s.id, s]));

// Mẫu tuần đang áp dụng cho 1 người: mẫu riêng, không có thì mẫu mặc định, không có nữa = null
const patternForUser = async (userId) => {
	const pool = await getPool();
	const row = (
		await pool.request().input('user_id', sql.VarChar(20), userId).query(`
      SELECT TOP 1 p.* FROM shift_patterns p
      WHERE p.id = (SELECT shift_pattern_id FROM users WHERE id = @user_id)
         OR (p.is_default = 1 AND NOT EXISTS (SELECT 1 FROM users WHERE id = @user_id AND shift_pattern_id IS NOT NULL))
      ORDER BY p.is_default
    `)
	).recordset[0];
	return parsePattern(row) ?? null;
};

const assignmentsForUser = async (userId, from, to) => {
	const pool = await getPool();
	return (
		await pool.request().input('user_id', sql.VarChar(20), userId).input('from', sql.Date, from).input('to', sql.Date, to)
			.query('SELECT work_date, shift_id FROM shift_assignments WHERE user_id = @user_id AND work_date BETWEEN @from AND @to')
	).recordset.map((a) => ({ ...a, work_date: dateKey(a.work_date) }));
};

// Lịch ca cả viện trong 1 ngày (bảng chấm công): mẫu của từng người + phân ca ngày đó
const planForDate = async (date) => {
	const pool = await getPool();
	const [users, patterns, assignments, shifts] = await Promise.all([
		listUsers(),
		listPatterns(),
		pool.request().input('date', sql.Date, date).query('SELECT user_id, work_date, shift_id FROM shift_assignments WHERE work_date = @date'),
		shiftsMap(),
	]);
	return {
		users,
		patternsById: new Map(patterns.map((p) => [p.id, p])),
		defaultPattern: patterns.find((p) => p.is_default) ?? null,
		assignments: assignments.recordset.map((a) => ({ ...a, work_date: dateKey(a.work_date) })),
		shifts,
	};
};

module.exports = {
	listShifts,
	saveShift,
	removeShift,
	listPatterns,
	savePattern,
	removePattern,
	listUsers,
	setPatternUsers,
	getRoster,
	setRoster,
	shiftsMap,
	patternForUser,
	assignmentsForUser,
	planForDate,
};
