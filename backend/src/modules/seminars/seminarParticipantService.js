/**
 * seminarParticipantService.js — người tham dự / được cử đi + cấp CME.
 *
 * Số quyết định CME (SQĐ) sinh qua sp_gen_cme_no: dãy chạy theo NĂM, 1..N liên
 * tục cho mọi hội nghị trong năm; sang năm mới reset. Cấp nhiều người một lần
 * thì cấp tuần tự trong 1 transaction để giữ dãy liền mạch.
 */
const { signToken, verifyToken } = require('../../utils/keys');
const { getPool, sql, withTransaction } = require('../../config/db');
const { broadcast } = require('../events/eventService');
const personService = require('../persons/personService');
const { normalizeGender } = require('../../utils/gender');
const { httpError } = require('../../utils/httpError');
const { deptAccountJoinSql, isDeptAccountJoinedSql } = require('../../utils/deptAccount');

// Mã QR điểm danh hội thảo — JWT ngắn hạn ký seminar_id (mirror
// courseService.generateAttendanceQrToken / utils/captcha.js).
const CHECKIN_QR_TTL = '75s'; // xem giải thích ở training/courses/courseAttendanceService.js (ATTENDANCE_QR_TTL)
const CHECKIN_QR_PURPOSE = 'seminar_checkin_qr';

const PART_TYPES = ['attendee', 'speaker', 'chair', 'organizer', 'trainee'];
const SOURCES = ['internal', 'external'];
// Sinh id trong SQL: 'SPT' + 21 hex = 24 ký tự
const NEW_ID_SQL = `'SPT' + LEFT(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''), 21)`;

const listBySeminar = async (seminarId) => {
	const pool = await getPool();
	const r = await pool.request().input('id', sql.VarChar(20), seminarId).query(`
      SELECT p.*, u.full_name AS user_full_name, u.staff_number AS user_staff_number,
             d.name AS user_department_name
      FROM seminar_participants p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE p.seminar_id = @id
      ORDER BY
        CASE p.participation_type WHEN 'chair' THEN 0 WHEN 'speaker' THEN 1
             WHEN 'organizer' THEN 2 WHEN 'attendee' THEN 3 ELSE 4 END,
        p.cme_seq, p.full_name;
    `);
	return r.recordset;
};

const ensureSeminar = async (pool, seminarId) => {
	const s = await pool
		.request()
		.input('id', sql.VarChar(20), seminarId)
		.query('SELECT id, event_year, cme_default_credits FROM seminars WHERE id = @id');
	if (!s.recordset.length) {
		throw httpError(404, 'Hội thảo/hội nghị không tồn tại.');
	}
	return s.recordset[0];
};

const normType = (t) => (PART_TYPES.includes(t) ? t : 'attendee');
const normSource = (s) => (SOURCES.includes(s) ? s : 'internal');

// Bind toàn bộ input cho 1 dòng participant vào `req`, trả về câu INSERT dùng
// biến @id đã khai báo trước đó (@id0 cho single, @idN trong vòng lặp bulk).
const bindInsert = (req, idVar, seminarId, data) => {
	req
		.input('seminar_id', sql.VarChar(20), seminarId)
		.input('user_id', sql.VarChar(20), data.user_id || null)
		.input('title_prefix', sql.NVarChar(10), data.title_prefix || null)
		.input('full_name', sql.NVarChar(255), data.full_name)
		.input('dob', sql.Date, data.dob || null)
		.input('dob_text', sql.NVarChar(50), data.dob_text || null)
		.input('gender', sql.VarChar(10), normalizeGender(data.gender))
		.input('organization', sql.NVarChar(255), data.organization || null)
		.input('department_raw', sql.NVarChar(255), data.department_raw || null)
		.input('staff_number', sql.Int, data.staff_number ?? null)
		.input('qualification_raw', sql.NVarChar(100), data.qualification_raw || null)
		.input('source', sql.VarChar(20), normSource(data.source))
		.input('is_foreign', sql.Bit, data.is_foreign ? 1 : 0)
		.input('participation_type', sql.VarChar(20), normType(data.participation_type))
		.input('cme_year', sql.Int, data.cme_year ?? null)
		.input('cme_seq', sql.Int, data.cme_seq ?? null)
		.input('cme_credits', sql.Decimal(4, 1), data.cme_credits ?? null)
		.input('cme_status', sql.VarChar(15), data.cme_status || 'none')
		.input('cme_issued_date', sql.Date, data.cme_issued_date || null)
		.input('notes', sql.NVarChar(255), data.notes || null)
		.input('phone', sql.VarChar(20), data.phone || null)
		.input('email', sql.NVarChar(255), data.email || null)
		.input('ticket_code', sql.VarChar(32), data.ticket_code || null);
	return `
    INSERT INTO seminar_participants
      (id, seminar_id, user_id, title_prefix, full_name, dob, dob_text, gender,
       organization, department_raw, staff_number, qualification_raw, source,
       is_foreign, participation_type, cme_year, cme_seq, cme_credits, cme_status,
       cme_issued_date, notes, phone, email, ticket_code, created_by)
    VALUES
      (${idVar}, @seminar_id, @user_id, @title_prefix, @full_name, @dob, @dob_text, @gender,
       @organization, @department_raw, @staff_number, @qualification_raw, @source,
       @is_foreign, @participation_type, @cme_year, @cme_seq, @cme_credits, @cme_status,
       @cme_issued_date, @notes, @phone, @email, @ticket_code, @actor_id);`;
};

const add = async (seminarId, data, actorId) => {
	const pool = await getPool();
	await ensureSeminar(pool, seminarId);
	if (!data.full_name || !String(data.full_name).trim()) {
		throw httpError(400, 'Họ tên không được để trống.');
	}
	const req = pool.request().input('actor_id', sql.VarChar(20), actorId);
	const insert = bindInsert(req, '@id', seminarId, data);
	const r = await req.query(`
    EXEC sp_set_actor @actor_id;
    DECLARE @id VARCHAR(24) = ${NEW_ID_SQL};
    ${insert}
    SELECT * FROM seminar_participants WHERE id = @id;
  `);
	if (r.recordset[0])
		await personService.syncPerson('seminar_participants', r.recordset[0].id, { actorId });
	broadcast('update', { entity: 'seminar' });
	return r.recordset[0];
};

const bulkAdd = async (seminarId, rows, actorId) => {
	const pool = await getPool();
	await ensureSeminar(pool, seminarId);
	const valid = (rows || []).filter((r) => r.full_name && String(r.full_name).trim());
	if (!valid.length) return { inserted: 0, ids: [] };
	const ids = await withTransaction(async (tx) => {
		await new sql.Request(tx)
			.input('actor_id', sql.VarChar(20), actorId)
			.query('EXEC sp_set_actor @actor_id');
		const inserted = [];
		for (const row of valid) {
			const req = new sql.Request(tx).input('actor_id', sql.VarChar(20), actorId);
			const insert = bindInsert(req, '@id', seminarId, row);
			const r = await req.query(`
        DECLARE @id VARCHAR(24) = ${NEW_ID_SQL};
        ${insert}
        SELECT @id AS id;
      `);
			inserted.push(r.recordset[0].id);
		}
		return inserted;
	}, pool);
	await personService.syncPersons('seminar_participants', ids, { actorId });
	broadcast('update', { entity: 'seminar' });
	return { inserted: valid.length, ids };
};

// ─── Tập huấn bệnh viện: người tham dự theo khoa ─────────────────────────────

// Nhân sự đang làm việc (bỏ tài khoản dùng chung của khoa) — dùng chung cho
// chọn người theo khoa và báo cáo "chưa tham dự".
const staffFrom = `FROM users u
  LEFT JOIN departments d ON d.id = u.department_id
  ${deptAccountJoinSql('u')}`;
const staffWhere = `u.is_active = 1 AND NOT ${isDeptAccountJoinedSql('u')}`;

// Nhân sự 1 khoa, kèm cờ đã có trong danh sách người tham dự
const staffOfDepartment = async (seminarId, departmentId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('sid', sql.VarChar(20), seminarId)
		.input('dept', sql.VarChar(20), departmentId).query(`
      SELECT u.id, u.staff_number, u.full_name, d.name AS department_name,
             CAST(CASE WHEN EXISTS (SELECT 1 FROM seminar_participants p
                  WHERE p.seminar_id = @sid AND p.user_id = u.id) THEN 1 ELSE 0 END AS BIT) AS in_list
      ${staffFrom}
      WHERE u.department_id = @dept AND ${staffWhere}
      ORDER BY u.full_name;
    `);
	return r.recordset;
};

// Thêm nhân sự vào danh sách (vai trò Học viên) — bỏ qua người đã có
const addUsers = async (seminarId, userIds, actorId) => {
	const pool = await getPool();
	await ensureSeminar(pool, seminarId);
	const ids = [...new Set((userIds || []).filter(Boolean))];
	if (!ids.length) return { inserted: 0, skipped: 0 };
	const r = await pool
		.request()
		.input('sid', sql.VarChar(20), seminarId)
		.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids)).query(`
      SELECT u.id, u.full_name, u.staff_number, u.date_of_birth, d.name AS department_name
      FROM users u LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.id IN (SELECT [value] FROM OPENJSON(@ids))
        AND NOT EXISTS (SELECT 1 FROM seminar_participants p WHERE p.seminar_id = @sid AND p.user_id = u.id)
      ORDER BY d.name, u.full_name;
    `);
	const { inserted } = await bulkAdd(
		seminarId,
		r.recordset.map((u) => ({
			user_id: u.id,
			full_name: u.full_name,
			staff_number: u.staff_number,
			dob: u.date_of_birth,
			department_raw: u.department_name,
			source: 'internal',
			participation_type: 'trainee',
		})),
		actorId,
	);
	return { inserted, skipped: ids.length - inserted };
};

// Thêm cả khoa bắt buộc 1 lần (GĐ6): mọi nhân sự đang làm việc của các khoa bắt
// buộc chưa có trong danh sách — chạy lại chỉ thêm người mới vào khoa.
const addRequiredStaff = async (seminarId, actorId) => {
	const pool = await getPool();
	const r = await pool.request().input('sid', sql.VarChar(20), seminarId).query(`
      SELECT u.id
      FROM seminar_required_departments r
      JOIN users u ON u.department_id = r.department_id
      ${deptAccountJoinSql('u')}
      WHERE r.seminar_id = @sid AND ${staffWhere}
        AND NOT EXISTS (SELECT 1 FROM seminar_participants p WHERE p.seminar_id = @sid AND p.user_id = u.id)`);
	if (!r.recordset.length) return { inserted: 0, skipped: 0 };
	return addUsers(
		seminarId,
		r.recordset.map((u) => u.id),
		actorId,
	);
};

// Nhân sự thuộc khoa bắt buộc mà chưa tham dự: chưa có trong danh sách, hoặc
// tự đăng ký qua QR (có vé) nhưng chưa điểm danh.
const requiredAbsentees = async (seminarId) => {
	const pool = await getPool();
	const r = await pool.request().input('sid', sql.VarChar(20), seminarId).query(`
      SELECT u.id, u.staff_number, u.full_name, d.name AS department_name,
             CASE WHEN p.id IS NULL THEN 'not_listed' ELSE 'not_checked_in' END AS reason
      FROM seminar_required_departments r
      JOIN users u ON u.department_id = r.department_id
      LEFT JOIN departments d ON d.id = u.department_id
      ${deptAccountJoinSql('u')}
      OUTER APPLY (SELECT TOP 1 p.id, p.ticket_code, p.checked_in_at FROM seminar_participants p
                   WHERE p.seminar_id = r.seminar_id AND p.user_id = u.id) p
      WHERE r.seminar_id = @sid AND ${staffWhere}
        AND (p.id IS NULL OR (p.ticket_code IS NOT NULL AND p.checked_in_at IS NULL))
      ORDER BY d.name, u.full_name;
    `);
	return r.recordset;
};

const UPDATABLE = {
	title_prefix: sql.NVarChar(10),
	full_name: sql.NVarChar(255),
	dob: sql.Date,
	dob_text: sql.NVarChar(50),
	organization: sql.NVarChar(255),
	department_raw: sql.NVarChar(255),
	staff_number: sql.Int,
	qualification_raw: sql.NVarChar(100),
	cme_credits: sql.Decimal(4, 1),
	cme_issued_date: sql.Date,
	notes: sql.NVarChar(255),
};

const update = async (seminarId, pid, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool
		.request()
		.input('sid', sql.VarChar(20), seminarId)
		.input('pid', sql.VarChar(24), pid)
		.input('actor_id', sql.VarChar(20), actorId);

	for (const [k, t] of Object.entries(UPDATABLE)) {
		if (data[k] !== undefined) {
			sets.push(`${k} = @${k}`);
			req.input(k, t, data[k] === '' ? null : data[k]);
		}
	}
	if (data.gender !== undefined) {
		sets.push('gender = @gender');
		req.input('gender', sql.VarChar(10), normalizeGender(data.gender));
	}
	if (data.user_id !== undefined) {
		sets.push('user_id = @user_id');
		req.input('user_id', sql.VarChar(20), data.user_id || null);
	}
	if (data.source !== undefined) {
		sets.push('source = @source');
		req.input('source', sql.VarChar(20), normSource(data.source));
	}
	if (data.is_foreign !== undefined) {
		sets.push('is_foreign = @is_foreign');
		req.input('is_foreign', sql.Bit, data.is_foreign ? 1 : 0);
	}
	if (data.participation_type !== undefined) {
		sets.push('participation_type = @participation_type');
		req.input('participation_type', sql.VarChar(20), normType(data.participation_type));
	}

	const r = await req.query(`
    EXEC sp_set_actor @actor_id;
    UPDATE seminar_participants SET ${sets.join(', ')}
    WHERE id = @pid AND seminar_id = @sid;
    SELECT * FROM seminar_participants WHERE id = @pid AND seminar_id = @sid;
  `);
	await personService.syncPerson('seminar_participants', pid, { actorId });
	broadcast('update', { entity: 'seminar' });
	return r.recordset[0] || null;
};

const remove = async (seminarId, pid, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('sid', sql.VarChar(20), seminarId)
		.input('pid', sql.VarChar(24), pid)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      EXEC sp_set_actor @actor_id;
      DELETE FROM seminar_participants WHERE id = @pid AND seminar_id = @sid;
    `);
	broadcast('update', { entity: 'seminar' });
};

// seminar_participants đã có sẵn user_id (khác course_enrollments phải qua
// trainees) — tự điểm danh chỉ cần so đúng tài khoản đang đăng nhập, KHÔNG tự
// tạo participant mới nếu chưa có trong danh sách (tránh lộ khả năng "tự đăng
// ký tham dự" qua đường quét QR).
const generateCheckInQrToken = (seminarId) =>
	signToken('seminar-qr', { seminar_id: seminarId, purpose: CHECKIN_QR_PURPOSE }, CHECKIN_QR_TTL);

const checkInSelf = async (token, deviceId, actor) => {
	let decoded;
	try {
		decoded = verifyToken('seminar-qr', token);
	} catch {
		throw httpError(401, 'Mã QR đã hết hạn, vui lòng thử lại.');
	}
	if (decoded.purpose !== CHECKIN_QR_PURPOSE) {
		throw httpError(401, 'Mã QR không hợp lệ.');
	}

	const pool = await getPool();
	const result = await pool
		.request()
		.input('seminar_id', sql.VarChar(20), decoded.seminar_id)
		.input('user_id', sql.VarChar(20), actor.id)
		.input('device_id', sql.VarChar(64), deviceId).query(`
      -- 1 thiết bị chỉ điểm danh cho 1 người mỗi hội thảo (xem courseService.checkInSelf)
      DECLARE @device_taken BIT = CASE WHEN EXISTS (
        SELECT 1 FROM seminar_participants WHERE seminar_id = @seminar_id
          AND checkin_device_id = @device_id AND (user_id IS NULL OR user_id <> @user_id)
      ) THEN 1 ELSE 0 END;
      IF @device_taken = 0
        UPDATE seminar_participants SET checked_in_at = GETUTCDATE(), checkin_device_id = @device_id
        WHERE seminar_id = @seminar_id AND user_id = @user_id;
      SELECT id, @device_taken AS device_taken
      FROM seminar_participants WHERE seminar_id = @seminar_id AND user_id = @user_id;
    `);
	const row = result.recordset[0];
	if (!row) {
		throw httpError(403, 'Bạn không có trong danh sách tham dự hội thảo/hội nghị này.');
	}
	if (row.device_taken) {
		throw httpError(
			403,
			'Thiết bị này đã dùng để điểm danh cho người khác trong hội thảo/hội nghị này. Vui lòng dùng thiết bị của chính bạn hoặc liên hệ ban tổ chức.',
		);
	}
	broadcast('update', { entity: 'seminar' });
	return { seminar_id: decoded.seminar_id };
};

module.exports = {
	listBySeminar,
	add,
	bulkAdd,
	update,
	generateCheckInQrToken,
	checkInSelf,
	remove,
	PART_TYPES,
	SOURCES,
	ensureSeminar,
	staffOfDepartment,
	addUsers,
	addRequiredStaff,
	requiredAbsentees,
};
