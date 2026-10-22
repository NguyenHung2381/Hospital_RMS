/**
 * seminarParticipantService.js — người tham dự / được cử đi + cấp CME.
 *
 * Số quyết định CME (SQĐ) sinh qua sp_gen_cme_no: dãy chạy theo NĂM, 1..N liên
 * tục cho mọi hội nghị trong năm; sang năm mới reset. Cấp nhiều người một lần
 * thì cấp tuần tự trong 1 transaction để giữ dãy liền mạch.
 */
const crypto = require('crypto');
const { getPool, sql } = require('../../config/db');
const { broadcast } = require('../events/eventService');
const QRCode = require('qrcode');
const mailService = require('../notifications/mailService');
const mailQueue = require('../notifications/mailQueue');
const { renderSeminarBadgePng } = require('../../utils/seminarBadgeImage');
const { testState, testWindow } = require('../../utils/seminarSchedule');
const { httpError } = require('../../utils/httpError');
const {
	SUBMIT_GRACE_MS,
	attemptDeadline,
	gradeTest,
	isPassed,
	maxScore,
	publicQuestions,
	testOrder,
} = require('../../utils/seminarTest');
const { add } = require('./seminarParticipantService');
const { norm } = require('../../utils/vietnameseText');
const { ROLE, inputRoleId } = require('../access/roleCodes');

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
	const r = await pool.request().input('token', sql.VarChar(32), token)
		.query(`SELECT ${SEMINAR_PUBLIC_COLS}, ${REG_OPEN_SQL} AS registration_open
            FROM seminars s WHERE s.public_token = @token`);
	const row = r.recordset[0];
	if (!row || row.scope !== 'hosted')
		throw httpError(404, 'Không tìm thấy hội nghị — link đăng ký không đúng.');
	return row;
};

const HOSPITAL = 'Bệnh viện Hữu Nghị Đa Khoa Nghệ An';

// Nhân viên nội viện: tìm theo mã NV, họ tên phải khớp (bỏ dấu / hoa thường) —
// cần biết cả 2 mới ra hồ sơ. Loại tài khoản khoa dùng chung (vai trò dept_head).
const findStaff = async (fullName, staffNumber) => {
	const pool = await getPool();
	const r = await (
		await inputRoleId(pool.request(), 'dept_head_role', ROLE.DEPT_HEAD)
	).input('sn', sql.Int, Number(staffNumber)).query(`
      SELECT TOP 1 u.id, u.full_name, u.staff_number, u.date_of_birth, u.gender, u.phone_number,
             u.email, q.code AS title_prefix, q.name AS qualification, d.name AS department_name
      FROM users u
      LEFT JOIN qualifications q ON q.id = u.qualification_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.staff_number = @sn AND u.is_active = 1 AND u.role_id <> @dept_head_role`);
	const u = r.recordset[0];
	if (!u || norm(u.full_name) !== norm(fullName))
		throw httpError(404, 'Không tìm thấy nhân viên khớp họ tên và mã nhân viên đã nhập.');
	return u;
};

// Thông tin hiện lên form để người đăng ký xác nhận — không trả SĐT/email/ngày sinh
// ra cổng công khai, các trường đó backend tự điền lúc đăng ký.
const lookupStaff = async (token, fullName, staffNumber) => {
	await getPublicSeminar(token);
	const u = await findStaff(fullName, staffNumber);
	return {
		full_name: u.full_name,
		title_prefix: u.title_prefix,
		department_name: u.department_name,
		qualification: u.qualification,
	};
};

// Email tài khoản tự sinh (`...@member.local`) không nhận được thư
const realEmail = (e) => (e && !/@member\.local$/i.test(e) ? e : null);

const registerPublic = async (token, data) => {
	const seminar = await getPublicSeminar(token);
	if (!seminar.registration_open) throw httpError(409, 'Hội nghị đã kết thúc, không nhận đăng ký.');
	const pool = await getPool();

	let person;
	if (data.source === 'internal') {
		// Không tin dữ liệu form — lấy lại toàn bộ từ hồ sơ nhân sự
		const u = await findStaff(data.full_name, data.staff_number);
		person = {
			user_id: u.id,
			staff_number: u.staff_number,
			title_prefix: u.title_prefix,
			full_name: u.full_name.trim(),
			dob: u.date_of_birth,
			gender: u.gender,
			organization: HOSPITAL,
			department_raw: u.department_name,
			qualification_raw: u.qualification,
			phone: u.phone_number,
			email: realEmail(u.email),
		};
		const dup = await pool
			.request()
			.input('sid', sql.VarChar(20), seminar.id)
			.input('uid', sql.VarChar(20), u.id)
			.query('SELECT 1 FROM seminar_participants WHERE seminar_id = @sid AND user_id = @uid');
		if (dup.recordset.length)
			throw httpError(
				409,
				'Nhân viên này đã đăng ký hội nghị. Nếu mất mã QR, vui lòng liên hệ ban tổ chức.',
			);
	} else {
		person = {
			title_prefix: data.title_prefix,
			full_name: String(data.full_name).trim(),
			dob: data.dob,
			gender: data.gender,
			organization: data.organization,
			department_raw: data.department_raw,
			qualification_raw: data.qualification_raw,
			phone: data.phone,
			email: data.email,
		};
		const dup = await pool
			.request()
			.input('sid', sql.VarChar(20), seminar.id)
			.input('phone', sql.VarChar(20), data.phone)
			.query('SELECT 1 FROM seminar_participants WHERE seminar_id = @sid AND phone = @phone');
		if (dup.recordset.length)
			throw httpError(
				409,
				'Số điện thoại này đã đăng ký hội nghị. Nếu mất mã QR, vui lòng liên hệ ban tổ chức.',
			);
	}

	const ticketCode = crypto.randomBytes(16).toString('hex');
	await add(
		seminar.id,
		{ ...person, source: data.source, participation_type: 'attendee', ticket_code: ticketCode },
		null,
	);
	// Không chờ SMTP — đăng ký đã ghi xong, email chậm/lỗi không chặn phản hồi.
	if (person.email) {
		mailQueue.enqueue('thẻ đại biểu', () => sendBadgeMail(seminar, person, ticketCode));
	}
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
				content: await QRCode.toBuffer(ticketUrl, {
					type: 'png',
					width: 400,
					margin: 2,
					color: { dark: '#064d26' },
				}),
				cid: 'ticket-qr',
			},
		],
	});
};

// Vé + bài test của 1 người (p.id đặt tên khác vì trùng s.id). test_elapsed_sec tính trong SQL vì test_started_at
// ghi bằng GETDATE() (giờ máy chủ CSDL) — tránh lệch múi giờ khi so ở Node.
const loadTicket = async (code) => {
	const pool = await getPool();
	const r = await pool.request().input('code', sql.VarChar(32), code).query(`
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
	const eligible = !!(
		questions.length &&
		row.checked_in_at &&
		!row.test_submitted_at &&
		state === 'open'
	);
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
		throw httpError(
			409,
			'Bạn chưa được điểm danh — vui lòng đưa mã QR cho ban tổ chức quét trước.',
		);
	if (row.test_submitted_at) throw httpError(409, 'Bạn đã nộp bài test rồi.');
	if (a.state === 'off') throw httpError(409, 'Bài test chưa mở hoặc đã đóng.');
	if (a.state === 'scheduled')
		throw httpError(409, `Chưa tới giờ làm bài test (mở lúc ${row.test_start_time}).`);
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
			.query(
				'UPDATE seminar_participants SET test_started_at = GETDATE() WHERE id = @id AND test_started_at IS NULL',
			);
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
	if (row.test_duration_minutes && !a.started)
		throw httpError(409, 'Bạn chưa bấm "Bắt đầu làm bài".');
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
		.input('max_score', sql.Decimal(7, 2), g.max_score).query(`
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
// checked_in_at lưu giờ UTC (GETUTCDATE): driver mssql đọc DATETIME như UTC,
// GETDATE() là giờ VN của máy CSDL → FE hiển thị lệch +7 giờ.
const checkInTicket = async (seminarId, code, actorId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('sid', sql.VarChar(20), seminarId)
		.input('code', sql.VarChar(32), code)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      DECLARE @prev DATETIME, @pid VARCHAR(24), @psid VARCHAR(20);
      SELECT @pid = id, @psid = seminar_id, @prev = checked_in_at
      FROM seminar_participants WHERE ticket_code = @code;
      IF @pid IS NOT NULL AND @psid = @sid AND @prev IS NULL
      BEGIN
        EXEC sp_set_actor @actor_id;
        UPDATE seminar_participants SET checked_in_at = GETUTCDATE() WHERE id = @pid;
      END
      SELECT p.id, p.seminar_id, p.title_prefix, p.full_name, p.organization, p.checked_in_at,
             CAST(CASE WHEN @prev IS NULL THEN 0 ELSE 1 END AS BIT) AS already
      FROM seminar_participants p WHERE p.id = @pid;
    `);
	const row = r.recordset[0];
	if (!row) throw httpError(404, 'Mã QR không phải vé hội nghị hợp lệ.');
	if (row.seminar_id !== seminarId)
		throw httpError(409, `Vé của ${row.full_name} thuộc hội nghị khác.`);
	if (!row.already) broadcast('update', { entity: 'seminar' });
	return row;
};

module.exports = {
	getPublicSeminar,
	lookupStaff,
	registerPublic,
	getTicket,
	startTest,
	submitTest,
	checkInTicket,
};
