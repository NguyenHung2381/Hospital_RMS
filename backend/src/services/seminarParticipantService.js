/**
 * seminarParticipantService.js — người tham dự / được cử đi + cấp CME.
 *
 * Số quyết định CME (SQĐ) sinh qua sp_gen_cme_no: dãy chạy theo NĂM, 1..N liên
 * tục cho mọi hội nghị trong năm; sang năm mới reset. Cấp nhiều người một lần
 * thì cấp tuần tự trong 1 transaction để giữ dãy liền mạch.
 */
const crypto = require('crypto');
const { signToken, verifyToken } = require('../utils/keys');
const { getPool, sql, withTransaction } = require('../config/db');
const { broadcast } = require('../modules/events/eventService');
const personService = require('./personService');
const { normalizeGender } = require('../utils/gender');
const QRCode = require('qrcode');
const mailService = require('./mailService');
const { renderSeminarBadgePng } = require('../utils/seminarBadgeImage');
const { testState, testWindow } = require('../utils/seminarSchedule');
const { httpError } = require('../utils/httpError');
const {
	SUBMIT_GRACE_MS,
	attemptDeadline,
	gradeTest,
	isPassed,
	maxScore,
	publicQuestions,
	testOrder,
} = require('../utils/seminarTest');

// Mã QR điểm danh hội thảo — JWT ngắn hạn ký seminar_id (mirror
// courseService.generateAttendanceQrToken / utils/captcha.js).
const CHECKIN_QR_TTL = '75s'; // xem giải thích ở courseService.ATTENDANCE_QR_TTL
const CHECKIN_QR_PURPOSE = 'seminar_checkin_qr';

const PART_TYPES = ['attendee', 'speaker', 'chair', 'organizer', 'trainee'];
const SOURCES = ['internal', 'external'];
// Sinh id trong SQL: 'SPT' + 21 hex = 24 ký tự
const NEW_ID_SQL = `'SPT' + LEFT(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''), 21)`;

const listBySeminar = async (seminarId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), seminarId)
		.query(`
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
		const err = new Error('Hội thảo/hội nghị không tồn tại.');
		err.statusCode = 404;
		throw err;
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
		const err = new Error('Họ tên không được để trống.');
		err.statusCode = 400;
		throw err;
	}
	const req = pool.request().input('actor_id', sql.VarChar(20), actorId);
	const insert = bindInsert(req, '@id', seminarId, data);
	const r = await req.query(`
    EXEC sp_set_actor @actor_id;
    DECLARE @id VARCHAR(24) = ${NEW_ID_SQL};
    ${insert}
    SELECT * FROM seminar_participants WHERE id = @id;
  `);
	if (r.recordset[0]) await personService.syncPerson('seminar_participants', r.recordset[0].id, { actorId });
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
		.input('actor_id', sql.VarChar(20), actorId)
		.query(`
      EXEC sp_set_actor @actor_id;
      DELETE FROM seminar_participants WHERE id = @pid AND seminar_id = @sid;
    `);
	broadcast('update', { entity: 'seminar' });
};

// ─── CME ─────────────────────────────────────────────────────────────────────

// Điều kiện cấp CME (p = seminar_participants, s = seminars). Người do ban tổ
// chức thêm/nhập Excel (không có vé) giữ nghiệp vụ cũ: BTC tự chịu trách nhiệm.
// Có bài test thì phải nộp bài và đạt điểm đạt (nếu đặt); bài nộp trước khi có
// điểm theo trọng số (test_score NULL) tính mỗi câu đúng 1 điểm.
const CME_ELIGIBLE_SQL = `CAST(CASE WHEN p.ticket_code IS NULL OR (p.checked_in_at IS NOT NULL
  AND (s.test_questions IS NULL OR (p.test_submitted_at IS NOT NULL
    AND (s.test_pass_score IS NULL OR COALESCE(p.test_score, p.test_correct) >= s.test_pass_score))))
  THEN 1 ELSE 0 END AS BIT)`;

// Cấp số CME cho 1 hoặc nhiều người (tuần tự, giữ dãy liền mạch).
const issueCme = async (seminarId, participantIds, actorId, { year } = {}) => {
	const pool = await getPool();
	const seminar = await ensureSeminar(pool, seminarId);
	const cmeYear = parseInt(year, 10) || seminar.event_year;
	if (!cmeYear) {
		const err = new Error(
			'Chưa xác định được năm cấp CME. Hãy đặt "Năm sự kiện" cho hội nghị hoặc chọn năm khi cấp.',
		);
		err.statusCode = 400;
		throw err;
	}
	const ids = (participantIds || []).filter(Boolean);
	if (!ids.length) return { issued: 0, from: null, to: null, year: cmeYear, skipped: 0 };

	const result = await withTransaction(async (tx) => {
		await new sql.Request(tx)
			.input('actor_id', sql.VarChar(20), actorId)
			.query('EXEC sp_set_actor @actor_id');

		// chỉ người chưa có số, giữ đúng thứ tự gửi lên. Người tự đăng ký qua QR
		// (có ticket_code) phải điểm danh + nộp bài test (nếu hội nghị có bài
		// test) mới đủ điều kiện — còn lại bỏ qua, báo về `skipped`.
		const listReq = new sql.Request(tx).input('sid', sql.VarChar(20), seminarId);
		const inParams = ids
			.map((id, i) => {
				listReq.input(`p${i}`, sql.VarChar(24), id);
				return `@p${i}`;
			})
			.join(',');
		const pending = await listReq.query(`
      SELECT p.id, ${CME_ELIGIBLE_SQL} AS eligible
      FROM seminar_participants p JOIN seminars s ON s.id = p.seminar_id
      WHERE p.seminar_id = @sid AND p.cme_seq IS NULL AND p.id IN (${inParams});
    `);
		const pendingSet = new Set(pending.recordset.filter((r) => r.eligible).map((r) => r.id));
		const skipped = pending.recordset.length - pendingSet.size;
		const ordered = ids.filter((id) => pendingSet.has(id));

		let first = null;
		let last = null;
		for (const pid of ordered) {
			const gen = await new sql.Request(tx)
				.input('year', sql.Int, cmeYear)
				.input('actor_id', sql.VarChar(20), actorId)
				.output('new_seq', sql.Int)
				.execute('sp_gen_cme_no');
			const seq = gen.output.new_seq;
			if (first === null) first = seq;
			last = seq;
			await new sql.Request(tx)
				.input('pid', sql.VarChar(24), pid)
				.input('year', sql.Int, cmeYear)
				.input('seq', sql.Int, seq)
				.input('credits', sql.Decimal(4, 1), seminar.cme_default_credits ?? null)
				.query(`
          UPDATE seminar_participants
          SET cme_year = @year, cme_seq = @seq, cme_status = 'issued',
              cme_issued_date = COALESCE(cme_issued_date, CAST(GETDATE() AS DATE)),
              cme_credits = COALESCE(cme_credits, @credits)
          WHERE id = @pid;
        `);
		}
		return { issued: ordered.length, from: first, to: last, year: cmeYear, skipped };
	}, pool);
	broadcast('update', { entity: 'seminar' });
	return result;
};

// Thu hồi số CME — tạo lỗ hổng trong sổ, không tự dồn.
const revokeCme = async (seminarId, pid, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('sid', sql.VarChar(20), seminarId)
		.input('pid', sql.VarChar(24), pid)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(`
      EXEC sp_set_actor @actor_id;
      UPDATE seminar_participants
      SET cme_year = NULL, cme_seq = NULL, cme_status = 'none', cme_issued_date = NULL
      WHERE id = @pid AND seminar_id = @sid;
    `);
	broadcast('update', { entity: 'seminar' });
};

// Đổi trạng thái issued ↔ signed hàng loạt
const setCmeStatus = async (seminarId, ids, status, actorId) => {
	if (!['issued', 'signed'].includes(status)) {
		const err = new Error('Trạng thái CME không hợp lệ.');
		err.statusCode = 400;
		throw err;
	}
	const list = (ids || []).filter(Boolean);
	if (!list.length) return { updated: 0 };
	const pool = await getPool();
	const req = pool
		.request()
		.input('sid', sql.VarChar(20), seminarId)
		.input('status', sql.VarChar(15), status)
		.input('actor_id', sql.VarChar(20), actorId);
	const inParams = list
		.map((id, i) => {
			req.input(`p${i}`, sql.VarChar(24), id);
			return `@p${i}`;
		})
		.join(',');
	const r = await req.query(`
    EXEC sp_set_actor @actor_id;
    UPDATE seminar_participants SET cme_status = @status
    WHERE seminar_id = @sid AND cme_seq IS NOT NULL AND id IN (${inParams});
    SELECT @@ROWCOUNT AS updated;
  `);
	broadcast('update', { entity: 'seminar' });
	return { updated: r.recordset[0].updated };
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
		const err = new Error('Mã QR đã hết hạn, vui lòng thử lại.');
		err.statusCode = 401;
		throw err;
	}
	if (decoded.purpose !== CHECKIN_QR_PURPOSE) {
		const err = new Error('Mã QR không hợp lệ.');
		err.statusCode = 401;
		throw err;
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
        UPDATE seminar_participants SET checked_in_at = GETDATE(), checkin_device_id = @device_id
        WHERE seminar_id = @seminar_id AND user_id = @user_id;
      SELECT id, @device_taken AS device_taken
      FROM seminar_participants WHERE seminar_id = @seminar_id AND user_id = @user_id;
    `);
	const row = result.recordset[0];
	if (!row) {
		const err = new Error('Bạn không có trong danh sách tham dự hội thảo/hội nghị này.');
		err.statusCode = 403;
		throw err;
	}
	if (row.device_taken) {
		const err = new Error(
			'Thiết bị này đã dùng để điểm danh cho người khác trong hội thảo/hội nghị này. Vui lòng dùng thiết bị của chính bạn hoặc liên hệ ban tổ chức.',
		);
		err.statusCode = 403;
		throw err;
	}
	broadcast('update', { entity: 'seminar' });
	return { seminar_id: decoded.seminar_id };
};

// ─── Đăng ký công khai qua QR → vé QR → điểm danh → bài test ─────────────────
// QR đăng ký mang link /hoi-nghi/<seminars.public_token>. Đăng ký xong người
// tham dự giữ vé QR mang link /hoi-nghi/ve/<ticket_code>: ban tổ chức quét vé
// để điểm danh (checkInTicket), người tham dự mở chính link đó để làm bài test.
// Mã 128-bit ngẫu nhiên — không dò được, nên không cần đăng nhập.
const parseQuestions = (json) => {
	try {
		return JSON.parse(json || '[]');
	} catch {
		return [];
	}
};

const SEMINAR_PUBLIC_COLS = `s.id, s.title, s.location, s.start_date, s.end_date, s.start_time, s.end_time,
  s.date_text, s.grants_cme, s.cme_default_credits, s.scope`;
// Bài test: câu hỏi + công tắc mở + khung giờ (utils/seminarSchedule.testState) + cấu hình (utils/seminarTest)
const SEMINAR_TEST_COLS = `s.test_questions, s.test_open, s.test_date, s.test_end_date, s.test_start_time,
  s.test_end_time, s.test_duration_minutes, s.test_pass_score, s.test_shuffle_questions, s.test_shuffle_options`;
// Hết hạn đăng ký sau ngày kết thúc (không có ngày kết thúc thì theo ngày bắt đầu)
const REG_OPEN_SQL = `CAST(CASE WHEN s.scope = 'hosted' AND COALESCE(s.end_date, s.start_date, '9999-12-31')
  >= CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END AS BIT)`;

const getPublicSeminar = async (token) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('token', sql.VarChar(32), token)
		.query(`SELECT ${SEMINAR_PUBLIC_COLS}, ${REG_OPEN_SQL} AS registration_open
            FROM seminars s WHERE s.public_token = @token`);
	const row = r.recordset[0];
	if (!row || row.scope !== 'hosted') throw httpError(404, 'Không tìm thấy hội nghị — link đăng ký không đúng.');
	return row;
};

const registerPublic = async (token, data) => {
	const seminar = await getPublicSeminar(token);
	if (!seminar.registration_open) throw httpError(409, 'Hội nghị đã kết thúc, không nhận đăng ký.');
	const pool = await getPool();
	const dup = await pool
		.request()
		.input('sid', sql.VarChar(20), seminar.id)
		.input('phone', sql.VarChar(20), data.phone)
		.query('SELECT 1 FROM seminar_participants WHERE seminar_id = @sid AND phone = @phone');
	if (dup.recordset.length)
		throw httpError(409, 'Số điện thoại này đã đăng ký hội nghị. Nếu mất mã QR, vui lòng liên hệ ban tổ chức.');

	const ticketCode = crypto.randomBytes(16).toString('hex');
	await add(
		seminar.id,
		{
			title_prefix: data.title_prefix,
			full_name: String(data.full_name).trim(),
			dob: data.dob,
			gender: data.gender,
			organization: data.organization,
			department_raw: data.department_raw,
			qualification_raw: data.qualification_raw,
			source: data.source,
			phone: data.phone,
			email: data.email,
			participation_type: 'attendee',
			ticket_code: ticketCode,
		},
		null,
	);
	// Không chờ SMTP — đăng ký đã ghi xong, email chậm/lỗi không chặn phản hồi.
	if (data.email) sendBadgeMail(seminar, data, ticketCode).catch((e) => console.error('[mail] thẻ đại biểu:', e.message));
	return { ticket_code: ticketCode };
};

// DATE từ mssql (useUTC mặc định) là 00:00 UTC → định dạng theo UTC để không lệch ngày
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN', { timeZone: 'UTC' }) : null);

const sendBadgeMail = async (seminar, data, code) => {
	if (!(await mailService.isEnabled('SEMINAR_BADGE'))) return; // khỏi vẽ ảnh thẻ khi không gửi
	const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
	const ticketUrl = `${appUrl}/hoi-nghi/ve/${code}`;
	const holder = `${data.title_prefix ? `${data.title_prefix} ` : ''}${String(data.full_name).trim()}`;
	const when =
		seminar.date_text ||
		[seminar.start_date, +seminar.end_date !== +seminar.start_date ? seminar.end_date : null]
			.map(fmtDate)
			.filter(Boolean)
			.join(' – ');
	const badge = {
		holder,
		organization: data.organization,
		seminarTitle: seminar.title,
		when,
		location: seminar.location,
		ticketUrl,
		code,
	};
	await mailService.send({
		event: 'SEMINAR_BADGE',
		to: data.email,
		subject: `Thẻ đại biểu — ${seminar.title}`,
		html: mailService.renderSeminarBadgeEmail(badge),
		attachments: [
			{ filename: 'the-dai-bieu.png', content: await renderSeminarBadgePng(badge) },
			mailService.LOGO_ATTACHMENT,
			{
				filename: 'ma-qr-diem-danh.png',
				content: await QRCode.toBuffer(ticketUrl, { type: 'png', width: 400, margin: 2, color: { dark: '#064d26' } }),
				cid: 'ticket-qr',
			},
		],
	});
};

// Vé + bài test của 1 người (p.id đặt tên khác vì trùng s.id). test_elapsed_sec tính trong SQL vì test_started_at
// ghi bằng GETDATE() (giờ máy chủ CSDL) — tránh lệch múi giờ khi so ở Node.
const loadTicket = async (code) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('code', sql.VarChar(32), code)
		.query(`
      SELECT p.id AS participant_id, p.ticket_code, p.title_prefix, p.full_name, p.organization, p.checked_in_at,
             p.test_started_at, DATEDIFF(SECOND, p.test_started_at, GETDATE()) AS test_elapsed_sec,
             p.test_submitted_at, p.test_correct, p.test_total, p.test_score, p.test_max_score,
             p.cme_certificate_no, p.cme_year, p.cme_credits,
             ${SEMINAR_TEST_COLS}, ${SEMINAR_PUBLIC_COLS}
      FROM seminar_participants p JOIN seminars s ON s.id = p.seminar_id
      WHERE p.ticket_code = @code;
    `);
	const row = r.recordset[0];
	if (!row) throw httpError(404, 'Mã vé không tồn tại.');
	return row;
};

// Trạng thái lượt làm bài của 1 vé lúc `now`
const testAttempt = (row, now = Date.now()) => {
	const questions = parseQuestions(row.test_questions);
	const state = testState(row, now);
	const started = !!row.test_started_at;
	const deadline = attemptDeadline(row, started ? row.test_elapsed_sec : null, now);
	const expired = deadline != null && now > deadline;
	// Có giới hạn thời gian làm bài thì phải bấm "Bắt đầu" mới nhận đề và bắt đầu tính giờ
	const needsStart = !!row.test_duration_minutes && !started;
	const eligible = !!(questions.length && row.checked_in_at && !row.test_submitted_at && state === 'open');
	const order = testOrder(questions, row.ticket_code, {
		shuffleQuestions: !!row.test_shuffle_questions,
		shuffleOptions: !!row.test_shuffle_options,
	});
	return {
		questions,
		order,
		state,
		started,
		deadline,
		expired,
		canStart: eligible && needsStart && !expired,
		canTake: eligible && !needsStart && !expired,
	};
};

// Lỗi chung khi bắt đầu / nộp bài
const assertCanTest = (row, a) => {
	if (!a.questions.length) throw httpError(409, 'Hội nghị này không có bài test.');
	if (!row.checked_in_at)
		throw httpError(409, 'Bạn chưa được điểm danh — vui lòng đưa mã QR cho ban tổ chức quét trước.');
	if (row.test_submitted_at) throw httpError(409, 'Bạn đã nộp bài test rồi.');
	if (a.state === 'off') throw httpError(409, 'Bài test chưa mở hoặc đã đóng.');
	if (a.state === 'scheduled') throw httpError(409, `Chưa tới giờ làm bài test (mở lúc ${row.test_start_time}).`);
};

const getTicket = async (code) => {
	const row = await loadTicket(code);
	const now = Date.now();
	const a = testAttempt(row, now);
	const window = testWindow(row, now);
	const submitted = !!row.test_submitted_at;
	// Bài nộp trước khi có điểm theo trọng số: mỗi câu đúng 1 điểm
	const score = row.test_score ?? row.test_correct;
	return {
		title_prefix: row.title_prefix,
		full_name: row.full_name,
		organization: row.organization,
		checked_in_at: row.checked_in_at,
		seminar: {
			title: row.title,
			location: row.location,
			start_date: row.start_date,
			end_date: row.end_date,
			start_time: row.start_time,
			end_time: row.end_time,
			date_text: row.date_text,
			grants_cme: row.grants_cme,
		},
		test: {
			has_test: a.questions.length > 0,
			open: a.state === 'open',
			state: a.state,
			window: window
				? {
						date: window.date,
						end_date: window.end_date,
						start_time: row.test_start_time,
						end_time: row.test_end_time,
					}
				: null,
			question_count: a.questions.length,
			max_score: submitted ? (row.test_max_score ?? row.test_total) : maxScore(a.questions),
			duration_minutes: row.test_duration_minutes,
			pass_score: row.test_pass_score,
			can_start: a.canStart,
			// Đã bắt đầu nhưng quá hạn mà chưa nộp (đóng trang trước khi tự nộp)
			expired: a.started && !submitted && a.expired,
			// Giây còn lại tới hạn nộp — trang vé đếm ngược, hết giờ thì tự nộp
			remaining_seconds:
				a.canTake && a.deadline != null ? Math.max(0, Math.floor((a.deadline - now) / 1000)) : null,
			submitted_at: row.test_submitted_at,
			correct: row.test_correct,
			total: row.test_total,
			score: submitted ? score : null,
			passed: submitted ? isPassed(row, score) : null,
			// Không bao giờ gửi đáp án đúng ra cổng công khai
			questions: a.canTake ? publicQuestions(a.questions, a.order) : null,
		},
		cme: row.cme_certificate_no
			? { certificate_no: row.cme_certificate_no, year: row.cme_year, credits: row.cme_credits }
			: null,
	};
};

// Bấm "Bắt đầu làm bài" (chỉ khi có giới hạn thời gian) — ghi giờ bắt đầu 1 lần duy nhất
const startTest = async (code) => {
	const row = await loadTicket(code);
	const a = testAttempt(row);
	assertCanTest(row, a);
	if (a.state === 'closed') throw httpError(409, 'Đã hết thời gian nhận bài test.');
	if (row.test_duration_minutes && !row.test_started_at) {
		const pool = await getPool();
		await pool
			.request()
			.input('id', sql.VarChar(24), row.participant_id)
			.query('UPDATE seminar_participants SET test_started_at = GETDATE() WHERE id = @id AND test_started_at IS NULL');
		broadcast('update', { entity: 'seminar' });
	}
	return getTicket(code);
};

// `answers` theo thứ tự câu/phương án hiển thị trên vé; null = bỏ trống (hết giờ tự nộp)
const submitTest = async (code, answers) => {
	const row = await loadTicket(code);
	const now = Date.now();
	const a = testAttempt(row, now);
	assertCanTest(row, a);
	if (row.test_duration_minutes && !a.started) throw httpError(409, 'Bạn chưa bấm "Bắt đầu làm bài".');
	// Hạn đã gồm giờ dừng tiếp nhận; cho trễ SUBMIT_GRACE_MS cho bài tự nộp lúc hết giờ
	if (a.deadline != null && now > a.deadline + SUBMIT_GRACE_MS)
		throw httpError(409, 'Đã hết thời gian làm bài — bài không được ghi nhận.');
	if (!Array.isArray(answers) || answers.length !== a.questions.length)
		throw httpError(400, 'Đề bài đã thay đổi — vui lòng tải lại trang.');
	const g = gradeTest(a.questions, a.order, answers);

	// WHERE test_submitted_at IS NULL: 2 lần bấm nộp song song chỉ ghi 1 lần
	const pool = await getPool();
	const u = await pool
		.request()
		.input('id', sql.VarChar(24), row.participant_id)
		.input('answers', sql.NVarChar(sql.MAX), JSON.stringify(g.picked))
		.input('correct', sql.Int, g.correct)
		.input('total', sql.Int, g.total)
		.input('score', sql.Decimal(7, 2), g.score)
		.input('max_score', sql.Decimal(7, 2), g.max_score)
		.query(`
      UPDATE seminar_participants
      SET test_answers = @answers, test_correct = @correct, test_total = @total,
          test_score = @score, test_max_score = @max_score, test_submitted_at = GETDATE()
      WHERE id = @id AND test_submitted_at IS NULL;
      SELECT @@ROWCOUNT AS n;
    `);
	if (!u.recordset[0].n) throw httpError(409, 'Bạn đã nộp bài test rồi.');
	broadcast('update', { entity: 'seminar' });
	return {
		correct: g.correct,
		total: g.total,
		score: g.score,
		max_score: g.max_score,
		passed: isPassed(row, g.score),
	};
};

// Ban tổ chức quét vé QR của người tham dự. Quét lại người đã điểm danh thì
// giữ giờ cũ, báo `already` để màn quét hiện cảnh báo.
const checkInTicket = async (seminarId, code, actorId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('sid', sql.VarChar(20), seminarId)
		.input('code', sql.VarChar(32), code)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(`
      DECLARE @prev DATETIME, @pid VARCHAR(24), @psid VARCHAR(20);
      SELECT @pid = id, @psid = seminar_id, @prev = checked_in_at
      FROM seminar_participants WHERE ticket_code = @code;
      IF @pid IS NOT NULL AND @psid = @sid AND @prev IS NULL
      BEGIN
        EXEC sp_set_actor @actor_id;
        UPDATE seminar_participants SET checked_in_at = GETDATE() WHERE id = @pid;
      END
      SELECT p.id, p.seminar_id, p.title_prefix, p.full_name, p.organization, p.checked_in_at,
             CAST(CASE WHEN @prev IS NULL THEN 0 ELSE 1 END AS BIT) AS already
      FROM seminar_participants p WHERE p.id = @pid;
    `);
	const row = r.recordset[0];
	if (!row) throw httpError(404, 'Mã QR không phải vé hội nghị hợp lệ.');
	if (row.seminar_id !== seminarId) throw httpError(409, `Vé của ${row.full_name} thuộc hội nghị khác.`);
	if (!row.already) broadcast('update', { entity: 'seminar' });
	return row;
};

module.exports = {
	getPublicSeminar,
	registerPublic,
	getTicket,
	startTest,
	submitTest,
	checkInTicket,
	listBySeminar,
	add,
	bulkAdd,
	update,
	generateCheckInQrToken,
	checkInSelf,
	remove,
	issueCme,
	revokeCme,
	setCmeStatus,
	PART_TYPES,
	SOURCES,
};
