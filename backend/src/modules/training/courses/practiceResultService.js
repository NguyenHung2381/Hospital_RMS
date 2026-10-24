/**
 * practiceResultService.js — đánh giá vòng thực hành GPHN
 * (docs/ke-hoach-thiet-ke-lai-luong-dao-tao.md GĐ3):
 *   - Người hướng dẫn (NHD) xem học viên mình kèm và tự đánh giá từng vòng
 *     (cổng nhân viên /user/huong-dan). Quyền theo enrollment_rotations.mentor_user_id
 *     = chính mình, không cần quyền vai trò (giống /me/teaching).
 *   - Phòng Đào tạo nhập hộ hàng loạt từ phiếu giấy: các vòng đã kết thúc chưa
 *     có kết quả, lọc theo NHD / khoa.
 * Mọi lần ghi kết quả đi qua enrollmentRotationService.update (ghi result_by /
 * result_at / result_source).
 */
const { getPool, sql } = require('../../../config/db');
const { scopeOf } = require('../../../permissions/authz');
const { httpError } = require('../../../utils/httpError');
const { todayKeyVN } = require('../../../utils/vnDate');
const rotationService = require('./enrollmentRotationService');
const { ASSIGNED_EXISTS_SQL, assertCourseChildInScope } = require('./coursePolicy');

const ROW_SELECT = `
  SELECT r.id, r.enrollment_id, r.round_title, r.seq, r.attempt_no, r.start_date, r.end_date, r.duration_text,
         r.department_id, ISNULL(d.name, r.department_name) AS department_name,
         r.mentor_user_id, r.mentor_name,
         r.result, r.result_comment, r.result_at, r.result_source, ub.full_name AS result_by_name,
         e.practice_code, e.course_id, c.name AS course_name,
         t.full_name AS trainee_name, t.phone AS trainee_phone,
         tp.code AS program_code, tp.name AS program_name
  FROM enrollment_rotations r
  JOIN course_enrollments e ON e.id = r.enrollment_id
  JOIN courses c ON c.id = e.course_id
  JOIN trainees t ON t.id = e.trainee_id
  LEFT JOIN training_programs tp ON tp.id = e.program_id
  LEFT JOIN departments d ON d.id = r.department_id
  LEFT JOIN users ub ON ub.id = r.result_by`;

// Hồ sơ còn hiệu lực: đã duyệt, chưa nghỉ học
const ACTIVE_SQL = `e.status = 'approved' AND ISNULL(e.progress_status, 'in_progress') <> 'dropped'`;

const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : null);

/** Giai đoạn của 1 vòng so với hôm nay — nhóm thẻ trên màn NHD. */
const phaseOf = (r, today) => {
	if (r.result !== 'pending') return 'done';
	if (day(r.end_date) < today) return 'awaiting';
	if (day(r.start_date) > today) return 'upcoming';
	return 'current';
};

/**
 * Vòng mình hướng dẫn: đang diễn ra, đã kết thúc chưa đánh giá, sắp bắt đầu
 * (≤ 30 ngày tới) và đã đánh giá trong 60 ngày gần đây.
 */
const listForMentor = async (userId) => {
	const today = todayKeyVN();
	const pool = await getPool();
	const r = await pool
		.request()
		.input('me', sql.VarChar(20), userId)
		.input('today', sql.Date, today).query(`
      ${ROW_SELECT}
      WHERE r.mentor_user_id = @me AND ${ACTIVE_SQL} AND r.start_date IS NOT NULL
        AND ((r.result = 'pending' AND r.start_date <= DATEADD(day, 30, @today))
          OR (r.result <> 'pending' AND r.result_at >= DATEADD(day, -60, @today)))
      ORDER BY r.end_date, r.start_date, t.full_name`);
	return r.recordset.map((x) => ({ ...x, phase: phaseOf(x, today) }));
};

/** Menu "Hướng dẫn thực hành": có vòng nào mình hướng dẫn (hiện menu) + số vòng chờ mình đánh giá (badge). */
const countForMentor = async (userId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('me', sql.VarChar(20), userId)
		.input('today', sql.Date, todayKeyVN()).query(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN r.result = 'pending' AND r.end_date < @today THEN 1 ELSE 0 END) AS awaiting
      FROM enrollment_rotations r JOIN course_enrollments e ON e.id = r.enrollment_id
      WHERE r.mentor_user_id = @me AND ${ACTIVE_SQL}`);
	const row = r.recordset[0] ?? {};
	return { total: row.total ?? 0, awaiting: row.awaiting ?? 0 };
};

const assertResult = (result) => {
	if (!['pending', 'pass', 'fail'].includes(result)) throw httpError(400, 'Kết quả không hợp lệ');
};

/** NHD đánh giá 1 vòng của mình: Đạt / Không đạt (hoặc bỏ đánh giá) + nhận xét. */
const evaluateAsMentor = async (rotationId, userId, { result, comment }) => {
	assertResult(result);
	const pool = await getPool();
	const row = (
		await pool.request().input('id', sql.VarChar(20), rotationId).query(`
      SELECT r.mentor_user_id, r.start_date, e.status, e.progress_status
      FROM enrollment_rotations r JOIN course_enrollments e ON e.id = r.enrollment_id
      WHERE r.id = @id`)
	).recordset[0];
	if (!row) throw httpError(404, 'Không tìm thấy vòng thực hành.');
	if (row.mentor_user_id !== userId) throw httpError(403, 'Bạn không phải người hướng dẫn của vòng này.');
	if (row.status !== 'approved' || row.progress_status === 'dropped')
		throw httpError(400, 'Hồ sơ không còn trong thời gian thực hành.');
	if (result !== 'pending' && (!row.start_date || day(row.start_date) > todayKeyVN()))
		throw httpError(400, 'Vòng chưa bắt đầu — chưa đánh giá được.');
	await rotationService.update(
		rotationId,
		{ result, result_comment: comment ?? null },
		userId,
		{ source: 'mentor' },
	);
};

/**
 * Phòng Đào tạo nhập hộ: vòng đã kết thúc (đến hết hôm nay) chưa có kết quả, kèm
 * danh sách NHD có vòng chờ để chọn. Lọc NHD / khoa làm ở client.
 */
const listAwaiting = async (actor) => {
	const pool = await getPool();
	const req = pool.request().input('today', sql.Date, todayKeyVN());
	const where = [ACTIVE_SQL, "r.result = 'pending'", 'r.end_date <= @today'];
	if (actor && scopeOf(actor, 'courses') === 'assigned') {
		where.push(ASSIGNED_EXISTS_SQL);
		req.input('actor_id', sql.VarChar(20), actor.id);
	}
	const r = await req.query(`${ROW_SELECT} WHERE ${where.join(' AND ')} ORDER BY r.mentor_name, r.end_date, t.full_name`);
	const all = r.recordset;
	// Lựa chọn bộ lọc kèm số vòng chờ — id '' = chưa phân NHD / chưa có khoa
	const count = (idKey, nameKey) => {
		const m = new Map();
		for (const x of all) {
			const id = x[idKey] ?? '';
			const cur = m.get(id) ?? { id, name: x[nameKey] || '', count: 0 };
			cur.count++;
			m.set(id, cur);
		}
		return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
	};
	return {
		rows: all,
		mentors: count('mentor_user_id', 'mentor_name'),
		departments: count('department_id', 'department_name'),
		total: all.length,
	};
};

/** Lưu nhiều kết quả một lần (phiếu giấy). Kiểm phạm vi khóa từng dòng; lỗi 1 dòng không chặn dòng khác. */
const saveBulk = async (actor, rows) => {
	let saved = 0;
	const failed = [];
	for (const row of rows) {
		try {
			assertResult(row.result);
			await assertCourseChildInScope('rotationId', row.id, actor);
			await rotationService.update(
				row.id,
				{ result: row.result, ...(row.comment !== undefined ? { result_comment: row.comment || null } : {}) },
				actor.id,
				{ source: 'staff' },
			);
			saved++;
		} catch (err) {
			failed.push({ id: row.id, message: err.message });
		}
	}
	return { saved, failed };
};

module.exports = { listForMentor, countForMentor, evaluateAsMentor, listAwaiting, saveBulk, phaseOf };
