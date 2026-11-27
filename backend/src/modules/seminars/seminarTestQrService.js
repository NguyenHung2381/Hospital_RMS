/**
 * seminarTestQrService.js — QR chung của 1 đề kiểm tra hội nghị (migration 2027-01-13).
 *
 * Ban tổ chức chiếu QR mang link /hoi-nghi/kiem-tra/<seminar_tests.qr_token> lên màn hình.
 * Người dự quét → nhập họ tên:
 *   - trùng họ tên (bỏ dấu / hoa thường) với người tham dự của hội nghị → hiện danh sách để
 *     xác nhận "là tôi" (kèm đơn vị, phân biệt người trùng tên) hoặc làm với tư cách khách;
 *   - không trùng ai (hoặc chọn "khách") → thêm người tham dự mới (ngoại viện, có mã vé như
 *     người tự đăng ký ⇒ muốn cấp CME vẫn phải được điểm danh, xem SELF_CREATED_SQL).
 * Xong được 1 mã lượt (seminar_test_qr_sessions.code) — trình duyệt giữ mã này để làm tiếp
 * bài; KHÔNG trả vé cá nhân của người khớp tên (vé là QR điểm danh + xem CME).
 *
 * Không cần điểm danh mới làm được bài (người đang ngồi ở hội trường quét QR trên màn hình),
 * nhưng điểm danh vẫn là điều kiện cấp CME. Bài nộp kiểu này ghi via = 'qr'; chỉ tính điều
 * kiện CME khi đề bật qr_counts_for_cme (CME_ELIGIBLE_SQL) — QR chung chỉ hỏi họ tên nên ai
 * biết tên người khác cũng làm thay được.
 */
const crypto = require('crypto');
const { getPool, sql } = require('../../config/db');
const { httpError } = require('../../utils/httpError');
const { testState } = require('../../utils/seminarSchedule');
const { norm } = require('../../utils/vietnameseText');
const { add } = require('./seminarParticipantService');
const pub = require('./seminarPublicService');

const QR_OPTS = { via: 'qr', requireCheckIn: false };

// Đề theo qr_token (kèm hội nghị). Đề trống câu hỏi coi như không có.
const loadQrTest = async (token) => {
	const pool = await getPool();
	const row = (
		await pool.request().input('token', sql.VarChar(32), token).query(`
      SELECT t.id AS test_id, t.seminar_id, ${pub.SEMINAR_PUBLIC_COLS}
      FROM seminar_tests t JOIN seminars s ON s.id = t.seminar_id
      WHERE t.qr_token = @token AND t.test_questions IS NOT NULL`)
	).recordset[0];
	if (!row) throw httpError(404, 'Không tìm thấy bài kiểm tra — link không đúng.');
	return row;
};

// Dòng đề đã ghép (withHolder) để dùng testState / ticketTest. Chưa có người làm thì
// participant_id = null ⇒ không có bài làm.
const loadTestRow = async (seminar, testId, holder = {}) => {
	const [t] = await pub.loadParticipantTests(seminar.id, holder.participant_id ?? '', testId);
	if (!t) throw httpError(404, 'Không tìm thấy bài kiểm tra — link không đúng.');
	return pub.withHolder(t, {
		start_date: seminar.start_date,
		end_date: seminar.end_date,
		participant_id: holder.participant_id ?? null,
		ticket_code: holder.ticket_code ?? null,
		checked_in_at: holder.checked_in_at ?? null,
	});
};

const seminarInfo = (s) => ({
	title: s.title,
	location: s.location,
	start_date: s.start_date,
	end_date: s.end_date,
	start_time: s.start_time,
	end_time: s.end_time,
	date_text: s.date_text,
	grants_cme: s.grants_cme,
});

// Bài nộp qua QR chung có được tính điều kiện CME không (để trang làm bài báo trước)
const cmeCounted = (t) => !!(t.counts_for_cme && t.qr_counts_for_cme);

const assertQrOpen = (t) => {
	if (!t.qr_enabled) throw httpError(409, 'Ban tổ chức đã tắt làm bài qua mã QR chung của đề này.');
};

/** Trang nhập họ tên: thông tin đề + hội nghị (không có câu hỏi) */
const getQrTest = async (token) => {
	const seminar = await loadQrTest(token);
	const t = await loadTestRow(seminar, seminar.test_id);
	const now = Date.now();
	const v = pub.ticketTest(t, now, { requireCheckIn: false });
	return {
		seminar: seminarInfo(seminar),
		test: {
			title: v.title,
			enabled: !!t.qr_enabled,
			state: v.state,
			window: v.window,
			question_count: v.question_count,
			max_score: v.max_score,
			duration_minutes: v.duration_minutes,
			pass_score: v.pass_score,
			counts_for_cme: cmeCounted(t),
		},
	};
};

// Mã lượt của (đề, người): đã có thì dùng lại (vào lại trên máy khác vẫn làm tiếp được)
const sessionFor = async (testId, participantId) => {
	const pool = await getPool();
	const find = async () =>
		(
			await pool
				.request()
				.input('tid', sql.VarChar(20), testId)
				.input('pid', sql.VarChar(24), participantId)
				.query(
					'SELECT code FROM seminar_test_qr_sessions WHERE test_id = @tid AND participant_id = @pid',
				)
		).recordset[0]?.code;
	const existing = await find();
	if (existing) return existing;
	// 2 lần bấm song song: ràng buộc (test_id, participant_id) giữ 1 dòng, đọc lại dòng thắng
	await pool
		.request()
		.input('code', sql.VarChar(32), crypto.randomBytes(16).toString('hex'))
		.input('tid', sql.VarChar(20), testId)
		.input('pid', sql.VarChar(24), participantId).query(`
      INSERT INTO seminar_test_qr_sessions (code, test_id, participant_id)
      VALUES (@code, @tid, @pid)
      ON CONFLICT (test_id, participant_id) DO NOTHING`);
	return find();
};

const GUEST_NOTE = 'Tự thêm khi làm bài kiểm tra qua mã QR chung';

/**
 * Nhập họ tên trên trang QR chung.
 * @param {string} token qr_token của đề
 * @param {{ full_name: string, organization?: string, participant_id?: string, as_guest?: boolean }} data
 * @returns {Promise<{ attempt_code: string } | { choices: { id: string, full_name: string, organization: string|null, department: string|null, guest: boolean }[] }>}
 */
const enter = async (token, data) => {
	const seminar = await loadQrTest(token);
	const t = await loadTestRow(seminar, seminar.test_id);
	assertQrOpen(t);
	const state = testState(t, Date.now());
	if (state === 'off') throw httpError(409, `Bài "${t.title}" chưa mở hoặc đã đóng.`);
	if (state === 'closed') throw httpError(409, 'Đã hết thời gian nhận bài kiểm tra.');

	const fullName = String(data.full_name ?? '')
		.trim()
		.replace(/\s+/g, ' ');
	const key = norm(fullName);
	if (!key) throw httpError(400, 'Vui lòng nhập họ tên.');

	const pool = await getPool();
	const people = (
		await pool.request().input('sid', sql.VarChar(20), seminar.id).query(`
      SELECT id, full_name, organization, department_raw, notes
      FROM seminar_participants WHERE seminar_id = @sid`)
	).recordset;
	const matches = people.filter((p) => norm(p.full_name) === key);

	let participantId;
	if (data.participant_id) {
		// Chỉ được chọn trong số người trùng đúng họ tên vừa nhập
		if (!matches.some((p) => p.id === data.participant_id))
			throw httpError(409, 'Lựa chọn không còn hợp lệ — vui lòng nhập lại họ tên.');
		participantId = data.participant_id;
	} else if (matches.length && !data.as_guest) {
		return {
			choices: matches.map((p) => ({
				id: p.id,
				full_name: p.full_name,
				organization: p.organization,
				department: p.department_raw,
				guest: p.notes === GUEST_NOTE,
			})),
		};
	} else {
		const organization = String(data.organization ?? '').trim() || null;
		const guest = await add(
			seminar.id,
			{
				full_name: fullName,
				organization,
				source: 'external',
				participation_type: 'attendee',
				// Có mã vé ⇒ là dòng "tự tạo": cấp CME phải điểm danh (SELF_CREATED_SQL)
				ticket_code: crypto.randomBytes(16).toString('hex'),
				notes: GUEST_NOTE,
			},
			null,
		);
		participantId = guest.id;
	}
	return { attempt_code: await sessionFor(t.id, participantId) };
};

// Lượt làm bài theo mã lượt: người làm + hội nghị + dòng đề đã ghép
const loadAttempt = async (code) => {
	const pool = await getPool();
	const row = (
		await pool.request().input('code', sql.VarChar(32), code).query(`
      SELECT q.test_id, p.id AS participant_id, p.ticket_code, p.checked_in_at, p.title_prefix,
             p.full_name, p.organization, ${pub.SEMINAR_PUBLIC_COLS}
      FROM seminar_test_qr_sessions q
      JOIN seminar_participants p ON p.id = q.participant_id
      JOIN seminars s ON s.id = p.seminar_id
      WHERE q.code = @code`)
	).recordset[0];
	if (!row) throw httpError(404, 'Lượt làm bài không tồn tại — vui lòng quét lại mã QR.');
	const t = await loadTestRow(row, row.test_id, row);
	return { row, t };
};

const getAttempt = async (code) => {
	const { row, t } = await loadAttempt(code);
	return {
		title_prefix: row.title_prefix,
		full_name: row.full_name,
		organization: row.organization,
		seminar: seminarInfo(row),
		qr_enabled: !!t.qr_enabled,
		counts_for_cme: cmeCounted(t),
		test: pub.ticketTest(t, Date.now(), { requireCheckIn: false }),
	};
};

const startAttempt = async (code) => {
	const { t } = await loadAttempt(code);
	assertQrOpen(t);
	await pub.beginAttempt(t, QR_OPTS);
	return getAttempt(code);
};

const submitAttempt = async (code, answers) => {
	const { t } = await loadAttempt(code);
	assertQrOpen(t);
	return pub.finishAttempt(t, answers, QR_OPTS);
};

module.exports = { getQrTest, enter, getAttempt, startAttempt, submitAttempt, GUEST_NOTE };
