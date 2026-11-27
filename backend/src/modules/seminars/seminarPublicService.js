/**
 * seminarParticipantService.js — người tham dự / được cử đi + cấp CME.
 *
 * Số quyết định CME (SQĐ) sinh qua genCmeNo (utils/idGenerator): dãy chạy theo NĂM, 1..N liên
 * tục cho mọi hội nghị trong năm; sang năm mới reset. Cấp nhiều người một lần
 * thì cấp tuần tự trong 1 transaction để giữ dãy liền mạch.
 */
const crypto = require('crypto');
const {
	getPool,
	sql,
	withActorTransaction,
	boolExpr,
	updateReturning,
	nowSql,
	utcNowSql,
	dateDiff,
} = require('../../config/db');
const { broadcast } = require('../events/eventService');
const { lazyRequire } = require('../../utils/lazyRequire');
/** @type {typeof import('qrcode')} */
const QRCode = lazyRequire('qrcode');
const mailService = require('../notifications/mailService');
const mailQueue = require('../notifications/mailQueue');
const { renderSeminarBadgePng } = require('../../utils/seminarBadgeImage');
const { testState, testWindow } = require('../../utils/seminarSchedule');
const { buildSeminarIcs } = require('../../utils/seminarCalendar');
const { httpError } = require('../../utils/httpError');
const {
	SUBMIT_GRACE_MS,
	attemptDeadline,
	gradeTest,
	isPassed,
	maxScore,
	participantScore,
	scaledScore,
	scaleMax,
	publicQuestions,
	testOrder,
} = require('../../utils/seminarTest');
const { add } = require('./seminarParticipantService');
const formCustomValueService = require('../forms/formCustomValueService');
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
// Đề kiểm tra (seminar_tests t): câu hỏi + công tắc mở + khung giờ (utils/seminarSchedule.testState)
// + cấu hình (utils/seminarTest)
const TEST_PUBLIC_COLS = `t.id, t.title, t.counts_for_cme, t.test_questions, t.test_open, t.test_date,
  t.test_end_date, t.test_start_time, t.test_end_time, t.test_duration_minutes, t.test_pass_score,
  t.test_score_scale, t.test_shuffle_questions, t.test_shuffle_options, t.qr_enabled, t.qr_counts_for_cme`;
// Hết hạn đăng ký sau ngày kết thúc (không có ngày kết thúc thì theo ngày bắt đầu)
const REG_OPEN_SQL = `${boolExpr(`s.scope = 'hosted' AND COALESCE(s.end_date, s.start_date, '9999-12-31')
  >= CAST(${nowSql} AS DATE)`)}`;

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

const HOSPITAL = 'Bệnh viện Hữu nghị Đa khoa Nghệ An';

// Nhân viên nội viện: tìm theo mã NV, họ tên phải khớp (bỏ dấu / hoa thường) —
// cần biết cả 2 mới ra hồ sơ. Loại tài khoản khoa dùng chung (vai trò dept_head).
const findStaff = async (fullName, staffNumber) => {
	const pool = await getPool();
	const r = await (
		await inputRoleId(pool.request(), 'dept_head_role', ROLE.DEPT_HEAD)
	).input('sn', sql.Int, Number(staffNumber)).query(`
      SELECT u.id, u.full_name, u.staff_number, u.date_of_birth, u.gender, u.phone_number,
             u.email, q.code AS title_prefix, q.name AS qualification, d.name AS department_name
      FROM users u
      LEFT JOIN qualifications q ON q.id = u.qualification_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.staff_number = @sn AND u.is_active = 'true' AND u.role_id <> @dept_head_role
      ORDER BY u.id OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY`);
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

// Mất / chưa lưu được ảnh QR: quét lại QR đăng ký, chọn nội viện / ngoại viện ⇒ trả lại mã vé.
// - Nội viện: họ tên + mã NV (như lúc đăng ký — findStaff) ⇒ vé đứng tên nhân viên đó.
// - Ngoại viện: họ tên + ngày sinh đã khai. Họ tên so bỏ dấu / hoa thường; trùng nhiều
//   người (cùng tên + ngày sinh) thì không trả vé nào — tránh đưa nhầm vé người khác.
// Đánh đổi (quyết định nghiệp vụ): ai biết các thông tin đó của người đã đăng ký cũng xem
// được vé; route chặn dò bằng captcha + giới hạn lượt tra sai theo IP.
const lookupTicket = async (token, { source, full_name: fullName, staff_number, dob }) => {
	const seminar = await getPublicSeminar(token);
	const pool = await getPool();
	if (source === 'internal') {
		const u = await findStaff(fullName, staff_number);
		const r = await pool
			.request()
			.input('sid', sql.VarChar(20), seminar.id)
			.input('uid', sql.VarChar(20), u.id).query(`
        SELECT ticket_code FROM seminar_participants
        WHERE seminar_id = @sid AND user_id = @uid AND ticket_code IS NOT NULL`);
		if (!r.recordset[0])
			throw httpError(
				404,
				'Nhân viên này chưa đăng ký hội nghị qua mã QR — vui lòng đăng ký hoặc liên hệ ban tổ chức.',
			);
		return { ticket_code: r.recordset[0].ticket_code };
	}
	const r = await pool
		.request()
		.input('sid', sql.VarChar(20), seminar.id)
		.input('dob', sql.Date, String(dob).slice(0, 10)).query(`
      SELECT full_name, ticket_code FROM seminar_participants
      WHERE seminar_id = @sid AND ticket_code IS NOT NULL AND CAST(dob AS DATE) = @dob`);
	const key = norm(fullName);
	const found = r.recordset.filter((p) => norm(p.full_name) === key);
	if (!found.length)
		throw httpError(
			404,
			'Không tìm thấy đăng ký khớp họ tên và ngày sinh. Nếu lúc đăng ký chưa có ngày sinh, vui lòng liên hệ ban tổ chức.',
		);
	if (found.length > 1)
		throw httpError(
			409,
			'Có nhiều đăng ký trùng họ tên và ngày sinh — vui lòng liên hệ ban tổ chức để nhận lại mã QR.',
		);
	return { ticket_code: found[0].ticket_code };
};

// Email tài khoản tự sinh (`...@member.local`) không nhận được thư
const realEmail = (e) => (e && !/@member\.local$/i.test(e) ? e : null);

// custom = trường tùy chỉnh (Cấu hình form 'seminar_participant') đã kiểm ở route
const registerPublic = async (token, data, custom = null) => {
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
				'Nhân viên này đã đăng ký hội nghị. Mất mã QR: bấm "Xem lại mã QR đã đăng ký", chọn Nội viện và nhập họ tên + mã nhân viên.',
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
				'Số điện thoại này đã đăng ký hội nghị. Mất mã QR: bấm "Xem lại mã QR đã đăng ký", chọn Ngoại viện và nhập họ tên + ngày sinh.',
			);
	}

	const ticketCode = crypto.randomBytes(16).toString('hex');
	const participant = await add(
		seminar.id,
		{ ...person, source: data.source, participation_type: 'attendee', ticket_code: ticketCode },
		null,
	);
	if (participant?.id)
		await formCustomValueService.save('seminar_participant', participant.id, custom);
	// Không chờ SMTP — đăng ký đã ghi xong, email chậm/lỗi không chặn phản hồi.
	// Chỉ gửi tới email của TÀI KHOẢN nhân viên (lấy từ hồ sơ, không phải form). Ngoại viện
	// tự gõ email mà không chứng minh sở hữu ⇒ không gửi (tránh lạm dụng SMTP bệnh viện gửi
	// thư kèm họ tên/đơn vị tùy ý tới người khác); họ xem vé ngay trên màn hình.
	if (data.source === 'internal' && person.email) {
		mailQueue.enqueue('thẻ đại biểu', () => sendBadgeMail(seminar, person, ticketCode));
	}
	// Trả vé ngay cho cả nội viện (quyết định nghiệp vụ: đăng ký xong hiện QR luôn).
	// Đánh đổi: nội viện chỉ cần họ tên + mã NV nên ai biết 2 thông tin đó có thể
	// đăng ký thay và cầm vé (điểm danh + làm bài test lấy CME đứng tên người kia).
	// Chặn trùng user_id ở trên ⇒ chính chủ đăng ký sau sẽ thấy "đã đăng ký" và báo
	// ban tổ chức. Mất vé: đăng nhập → "Tín chỉ CME của tôi" (portalService.getMyCme)
	// hoặc ban tổ chức mở vé QR ở danh sách người tham dự (SeminarTicketQrModal).
	return { ticket_code: ticketCode };
};

// DATE từ mssql (useUTC mặc định) là 00:00 UTC → định dạng theo UTC để không lệch ngày
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN', { timeZone: 'UTC' }) : null);

const appTicketUrl = (code) =>
	`${(process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')}/hoi-nghi/ve/${code}`;
const holderName = (p) =>
	`${p.title_prefix ? `${p.title_prefix} ` : ''}${String(p.full_name).trim()}`;

// Dữ liệu thẻ đại biểu (email + ảnh PNG) — `person`: title_prefix, full_name, organization
const badgeData = (seminar, person, code) => ({
	holder: holderName(person),
	organization: person.organization,
	seminarTitle: seminar.title,
	when:
		seminar.date_text ||
		[seminar.start_date, +seminar.end_date !== +seminar.start_date ? seminar.end_date : null]
			.map(fmtDate)
			.filter(Boolean)
			.join(' – '),
	location: seminar.location,
	ticketUrl: appTicketUrl(code),
	code,
});

const sendBadgeMail = async (seminar, data, code) => {
	if (!(await mailService.isEnabled('SEMINAR_BADGE'))) return; // khỏi vẽ ảnh thẻ khi không gửi
	const badge = badgeData(seminar, data, code);
	const { holder, ticketUrl } = badge;
	// Lịch hội nghị (Gmail / Mail của iOS hiện nút thêm vào lịch); chưa có ngày thì bỏ
	const ics = buildSeminarIcs(seminar, { code, holder, ticketUrl });
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
			...(ics
				? [
						{
							filename: 'lich-hoi-nghi.ics',
							content: ics,
							contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
						},
					]
				: []),
		],
	});
};

// Các đề kiểm tra (đã soạn câu hỏi) của hội nghị kèm bài làm của 1 người; `testId`: chỉ 1 đề.
// test_elapsed_sec tính trong SQL vì test_started_at ghi bằng nowSql (giờ VN do CSDL tính)
// — tránh lệch múi giờ khi so ở Node.
const loadParticipantTests = async (seminarId, participantId, testId = null) => {
	const pool = await getPool();
	const req = pool
		.request()
		.input('sid', sql.VarChar(20), seminarId)
		.input('pid', sql.VarChar(24), participantId);
	if (testId) req.input('tid', sql.VarChar(20), testId);
	return (
		await req.query(`
      SELECT ${TEST_PUBLIC_COLS},
             x.test_started_at, ${dateDiff('SECOND', 'x.test_started_at', nowSql)} AS test_elapsed_sec,
             x.test_submitted_at, x.test_correct, x.test_total, x.test_score, x.test_max_score, x.via
      FROM seminar_tests t
      LEFT JOIN seminar_test_submissions x ON x.test_id = t.id AND x.participant_id = @pid
      WHERE t.seminar_id = @sid AND t.test_questions IS NOT NULL ${testId ? 'AND t.id = @tid' : ''}
      ORDER BY t.sort_order, t.created_at, t.id;
    `)
	).recordset;
};

// Dòng đề + ngày hội nghị (ngày mở mặc định của testWindow) + người làm (điểm danh, hạt giống
// trộn đề). `p`: dòng có participant_id, ticket_code, checked_in_at, start_date, end_date.
const withHolder = (t, p) => ({
	...t,
	start_date: p.start_date,
	end_date: p.end_date,
	participant_id: p.participant_id,
	ticket_code: p.ticket_code,
	checked_in_at: p.checked_in_at,
});

// Vé của 1 người + mọi đề kiểm tra của hội nghị kèm bài làm của người đó.
const loadTicket = async (code) => {
	const pool = await getPool();
	const r = await pool.request().input('code', sql.VarChar(32), code).query(`
      SELECT p.id AS participant_id, p.ticket_code, p.title_prefix, p.full_name, p.organization, p.checked_in_at,
             p.cme_certificate_no, p.cme_year, p.cme_credits, ${SEMINAR_PUBLIC_COLS}
      FROM seminar_participants p JOIN seminars s ON s.id = p.seminar_id
      WHERE p.ticket_code = @code;
    `);
	const row = r.recordset[0];
	if (!row) throw httpError(404, 'Mã vé không tồn tại.');
	row.tests = (await loadParticipantTests(row.id, row.participant_id)).map((t) =>
		withHolder(t, row),
	);
	return row;
};

const findTest = (row, testId) => {
	const t = row.tests.find((x) => x.id === testId);
	if (!t) throw httpError(404, 'Đề kiểm tra không tồn tại.');
	return t;
};

// Trạng thái lượt làm 1 đề của 1 người lúc `now`. `t` = dòng đề đã ghép (withHolder).
// requireCheckIn: làm trên vé phải điểm danh trước; QR chung của đề (seminarTestQrService)
// thì không — điểm danh vẫn là điều kiện cấp CME riêng (CME_ELIGIBLE_SQL).
const testAttempt = (t, now = Date.now(), { requireCheckIn = true } = {}) => {
	const questions = parseQuestions(t.test_questions);
	const state = testState(t, now);
	const started = !!t.test_started_at;
	const deadline = attemptDeadline(t, started ? t.test_elapsed_sec : null, now);
	const expired = deadline != null && now > deadline;
	// Có giới hạn thời gian làm bài thì phải bấm "Bắt đầu" mới nhận đề và bắt đầu tính giờ
	const needsStart = !!t.test_duration_minutes && !started;
	const eligible = !!(
		questions.length &&
		(!requireCheckIn || t.checked_in_at) &&
		!t.test_submitted_at &&
		state === 'open'
	);
	// Mỗi đề trộn riêng: cùng người + cùng đề luôn ra cùng một thứ tự (vé hay QR chung đều
	// vậy). Người BTC thêm (không vé) chỉ làm được qua QR chung → hạt giống là mã người tham dự.
	const order = testOrder(questions, `${t.ticket_code || t.participant_id}:${t.id}`, {
		shuffleQuestions: !!t.test_shuffle_questions,
		shuffleOptions: !!t.test_shuffle_options,
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
const assertCanTest = (t, a, { requireCheckIn = true } = {}) => {
	if (!a.questions.length) throw httpError(409, 'Đề kiểm tra này chưa có câu hỏi.');
	if (requireCheckIn && !t.checked_in_at)
		throw httpError(
			409,
			'Bạn chưa được điểm danh — vui lòng đưa mã QR cho ban tổ chức quét trước.',
		);
	if (t.test_submitted_at) throw httpError(409, `Bạn đã nộp bài "${t.title}" rồi.`);
	if (a.state === 'off') throw httpError(409, `Bài "${t.title}" chưa mở hoặc đã đóng.`);
	if (a.state === 'scheduled')
		throw httpError(409, `Chưa tới giờ làm bài "${t.title}" (mở lúc ${t.test_start_time}).`);
};

// 1 đề trên vé / trang QR chung — không bao giờ gửi đáp án đúng ra cổng công khai
const ticketTest = (t, now, opts) => {
	const a = testAttempt(t, now, opts);
	const window = testWindow(t, now);
	const submitted = !!t.test_submitted_at;
	// Điểm đã quy về thang của đề (nếu đặt); bài nộp trước khi có điểm theo trọng số:
	// mỗi câu đúng 1 điểm
	const score = participantScore(t, t);
	return {
		id: t.id,
		title: t.title,
		counts_for_cme: !!t.counts_for_cme,
		open: a.state === 'open',
		state: a.state,
		window: window
			? {
					date: window.date,
					end_date: window.end_date,
					start_time: t.test_start_time,
					end_time: t.test_end_time,
				}
			: null,
		question_count: a.questions.length,
		max_score: scaleMax(t, submitted ? (t.test_max_score ?? t.test_total) : maxScore(a.questions)),
		duration_minutes: t.test_duration_minutes,
		pass_score: t.test_pass_score,
		can_start: a.canStart,
		// Đã bắt đầu nhưng quá hạn mà chưa nộp (đóng trang trước khi tự nộp)
		expired: a.started && !submitted && a.expired,
		// Giây còn lại tới hạn nộp — trang vé đếm ngược, hết giờ thì tự nộp
		remaining_seconds:
			a.canTake && a.deadline != null ? Math.max(0, Math.floor((a.deadline - now) / 1000)) : null,
		submitted_at: t.test_submitted_at,
		// Nộp qua QR chung của đề mà đề không tính CME cho kiểu nộp này (CME_ELIGIBLE_SQL)
		cme_excluded: submitted && t.via === 'qr' && !t.qr_counts_for_cme,
		correct: t.test_correct,
		total: t.test_total,
		score: submitted ? score : null,
		passed: submitted ? isPassed(t, score) : null,
		questions: a.canTake ? publicQuestions(a.questions, a.order) : null,
	};
};

const getTicket = async (code) => {
	const row = await loadTicket(code);
	const now = Date.now();
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
		tests: row.tests.map((t) => ticketTest(t, now)),
		cme: row.cme_certificate_no
			? { certificate_no: row.cme_certificate_no, year: row.cme_year, credits: row.cme_credits }
			: null,
	};
};

// Người giữ vé + hội nghị (cho file lịch / ảnh thẻ) — không nạp đề kiểm tra như loadTicket
const loadTicketHolder = async (code) => {
	const pool = await getPool();
	const r = await pool.request().input('code', sql.VarChar(32), code).query(`
      SELECT p.title_prefix, p.full_name, p.organization, ${SEMINAR_PUBLIC_COLS}
      FROM seminar_participants p JOIN seminars s ON s.id = p.seminar_id
      WHERE p.ticket_code = @code;
    `);
	const row = r.recordset[0];
	if (!row) throw httpError(404, 'Mã vé không tồn tại.');
	return row;
};

// File lịch (.ics) của vé — null khi hội nghị chưa có ngày tổ chức (chỉ có date_text)
const getTicketCalendar = async (code) => {
	const row = await loadTicketHolder(code);
	return buildSeminarIcs(row, { code, holder: holderName(row), ticketUrl: appTicketUrl(code) });
};

// Ảnh PNG thẻ đại biểu (cùng ảnh đính kèm email) — tải bằng link thường: trình duyệt trong
// Zalo/Facebook (WebView Android) không tải được ảnh dựng ở trình duyệt (blob:) nhưng giao
// được link http cho trình tải xuống của máy.
const getTicketBadgePng = async (code) => {
	const row = await loadTicketHolder(code);
	return { png: await renderSeminarBadgePng(badgeData(row, row, code)), fullName: row.full_name };
};

// Bấm "Bắt đầu làm bài" (chỉ khi đề có giới hạn thời gian) — ghi giờ bắt đầu 1 lần duy nhất.
// `t` = dòng đề đã ghép (withHolder); via: 'ticket' | 'qr' (kênh làm bài, migration 2027-01-13).
const beginAttempt = async (t, { via = 'ticket', requireCheckIn = true } = {}) => {
	const a = testAttempt(t, Date.now(), { requireCheckIn });
	assertCanTest(t, a, { requireCheckIn });
	if (a.state === 'closed') throw httpError(409, 'Đã hết thời gian nhận bài kiểm tra.');
	if (t.test_duration_minutes && !t.test_started_at) {
		const pool = await getPool();
		await pool
			.request()
			.input('tid', sql.VarChar(20), t.id)
			.input('pid', sql.VarChar(24), t.participant_id)
			.input('via', sql.VarChar(10), via).query(`
        INSERT INTO seminar_test_submissions (test_id, participant_id, test_started_at, via)
        VALUES (@tid, @pid, ${nowSql}, @via)
        ON CONFLICT (test_id, participant_id) DO NOTHING`);
		broadcast('update', { entity: 'seminar' });
	}
};

// `answers` theo thứ tự câu/phương án hiển thị; null = bỏ trống (hết giờ tự nộp).
// via ghi theo kênh NỘP bài (bắt đầu trên vé rồi nộp qua QR chung ⇒ 'qr').
const finishAttempt = async (t, answers, { via = 'ticket', requireCheckIn = true } = {}) => {
	const now = Date.now();
	const a = testAttempt(t, now, { requireCheckIn });
	assertCanTest(t, a, { requireCheckIn });
	if (t.test_duration_minutes && !a.started)
		throw httpError(409, 'Bạn chưa bấm "Bắt đầu làm bài".');
	// Hạn đã gồm giờ dừng tiếp nhận; cho trễ SUBMIT_GRACE_MS cho bài tự nộp lúc hết giờ
	if (a.deadline != null && now > a.deadline + SUBMIT_GRACE_MS)
		throw httpError(409, 'Đã hết thời gian làm bài — bài không được ghi nhận.');
	if (!Array.isArray(answers) || answers.length !== a.questions.length)
		throw httpError(400, 'Đề bài đã thay đổi — vui lòng tải lại trang.');
	const g = gradeTest(a.questions, a.order, answers);

	// Đề không giới hạn giờ chưa có dòng bài làm → INSERT; đã bấm bắt đầu → cập nhật dòng đó.
	// WHERE test_submitted_at IS NULL: 2 lần bấm nộp song song chỉ ghi 1 lần
	const pool = await getPool();
	const u = await pool
		.request()
		.input('tid', sql.VarChar(20), t.id)
		.input('pid', sql.VarChar(24), t.participant_id)
		.input('answers', sql.NVarChar(sql.MAX), JSON.stringify(g.picked))
		.input('correct', sql.Int, g.correct)
		.input('total', sql.Int, g.total)
		.input('score', sql.Decimal(7, 2), g.score)
		.input('max_score', sql.Decimal(7, 2), g.max_score)
		.input('via', sql.VarChar(10), via).query(`
      INSERT INTO seminar_test_submissions AS x (test_id, participant_id, test_answers, test_correct,
        test_total, test_score, test_max_score, test_submitted_at, via)
      VALUES (@tid, @pid, @answers, @correct, @total, @score, @max_score, ${nowSql}, @via)
      ON CONFLICT (test_id, participant_id) DO UPDATE
      SET test_answers = EXCLUDED.test_answers, test_correct = EXCLUDED.test_correct,
          test_total = EXCLUDED.test_total, test_score = EXCLUDED.test_score,
          test_max_score = EXCLUDED.test_max_score, test_submitted_at = EXCLUDED.test_submitted_at,
          via = EXCLUDED.via
      WHERE x.test_submitted_at IS NULL
    `);
	if (!u.rowsAffected[0]) throw httpError(409, `Bạn đã nộp bài "${t.title}" rồi.`);
	broadcast('update', { entity: 'seminar' });
	const score = scaledScore(t, g.score, g.max_score);
	return {
		correct: g.correct,
		total: g.total,
		score,
		max_score: scaleMax(t, g.max_score),
		passed: isPassed(t, score),
	};
};

const startTest = async (code, testId) => {
	const row = await loadTicket(code);
	await beginAttempt(findTest(row, testId));
	return getTicket(code);
};

const submitTest = async (code, testId, answers) => {
	const row = await loadTicket(code);
	return finishAttempt(findTest(row, testId), answers);
};

// Ban tổ chức quét vé QR của người tham dự. Quét lại người đã điểm danh thì
// giữ giờ cũ, báo `already` để màn quét hiện cảnh báo.
// checked_in_at lưu giờ UTC (utcNowSql): driver (cả mssql và pg) đọc cột giờ không múi giờ
// như UTC — lưu giờ VN (nowSql) thì FE hiển thị lệch +7 giờ.
const checkInTicket = async (seminarId, code, actorId) => {
	const row = await withActorTransaction(actorId, async (tx) => {
		const read = async () =>
			(
				await tx.request().input('code', sql.VarChar(32), code).query(`
          SELECT id, seminar_id, title_prefix, full_name, organization, checked_in_at
          FROM seminar_participants WHERE ticket_code = @code`)
			).recordset[0];
		const before = await read();
		if (!before || before.seminar_id !== seminarId || before.checked_in_at != null)
			return before && { ...before, already: before.checked_in_at != null };
		// Chỉ ghi khi chưa có giờ: 2 lần quét song song thì lần sau thấy đã điểm danh
		const claimed = await tx
			.request()
			.input('id', sql.VarChar(24), before.id)
			.query(
				updateReturning(
					`UPDATE seminar_participants SET checked_in_at = ${utcNowSql}`,
					'id = @id AND checked_in_at IS NULL',
					[['new.id', 'id', 'VARCHAR(24)']],
				),
			);
		return { ...(await read()), already: !claimed.recordset.length };
	});
	if (!row) throw httpError(404, 'Mã QR không phải vé hội nghị hợp lệ.');
	if (row.seminar_id !== seminarId)
		throw httpError(409, `Vé của ${row.full_name} thuộc hội nghị khác.`);
	if (!row.already) broadcast('update', { entity: 'seminar' });
	return row;
};

module.exports = {
	getPublicSeminar,
	lookupStaff,
	lookupTicket,
	registerPublic,
	getTicket,
	getTicketCalendar,
	getTicketBadgePng,
	startTest,
	submitTest,
	checkInTicket,
	// QR chung của đề (seminarTestQrService)
	SEMINAR_PUBLIC_COLS,
	loadParticipantTests,
	withHolder,
	ticketTest,
	beginAttempt,
	finishAttempt,
};
