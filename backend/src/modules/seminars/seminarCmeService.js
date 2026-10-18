/**
 * seminarParticipantService.js — người tham dự / được cử đi + cấp CME.
 *
 * Số quyết định CME (SQĐ) sinh qua sp_gen_cme_no: dãy chạy theo NĂM, 1..N liên
 * tục cho mọi hội nghị trong năm; sang năm mới reset. Cấp nhiều người một lần
 * thì cấp tuần tự trong 1 transaction để giữ dãy liền mạch.
 */
const { getPool, sql, withTransaction } = require('../../config/db');
const { broadcast } = require('../events/eventService');
const { ensureSeminar } = require('./seminarParticipantService');
const { httpError } = require('../../utils/httpError');

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
/**
 * @param {string} seminarId
 * @param {string[]} participantIds
 * @param {string} actorId
 * @param {{ year?: string|number }} [opts]
 */
const issueCme = async (seminarId, participantIds, actorId, { year } = {}) => {
	const pool = await getPool();
	const seminar = await ensureSeminar(pool, seminarId);
	const cmeYear = parseInt(String(year), 10) || seminar.event_year;
	if (!cmeYear) {
		throw httpError(
			400,
			'Chưa xác định được năm cấp CME. Hãy đặt "Năm sự kiện" cho hội nghị hoặc chọn năm khi cấp.',
		);
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
				.input('credits', sql.Decimal(4, 1), seminar.cme_default_credits ?? null).query(`
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
		.input('actor_id', sql.VarChar(20), actorId).query(`
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
		throw httpError(400, 'Trạng thái CME không hợp lệ.');
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

module.exports = {
	issueCme,
	revokeCme,
	setCmeStatus,
};
