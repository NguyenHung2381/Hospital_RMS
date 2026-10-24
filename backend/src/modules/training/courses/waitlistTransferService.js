/**
 * waitlistTransferService.js — "Người chờ từ đợt trước" (docs/ke-hoach-thiet-ke-lai-luong-dao-tao.md
 * GĐ4, quyết định 12c). Nội viện vào danh sách chờ khi lớp đầy; đợt mới cùng chương
 * trình KHÔNG tự kéo người sang nữa — tab Học viên của đợt mới gợi ý danh sách,
 * phòng Đào tạo chọn rồi bấm chuyển. Chuyển = đổi course_id của hồ sơ sang đợt này
 * và duyệt luôn (giữ decided_at để thứ tự chờ không đổi), trong giới hạn chỗ trống.
 */
const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { httpError } = require('../../../utils/httpError');
const programClassService = require('./programClassService');

const { APPLIES_SQL, roomOf } = programClassService;

/** Hồ sơ đang chờ ở khóa KHÁC, cùng chương trình với 1 lớp của khóa này. */
const CANDIDATE_SQL = `
  SELECT e.id, e.trainee_id, e.program_id, e.decided_at, e.registered_at,
         e.course_id AS from_course_id, c.name AS from_course_name,
         t.full_name AS trainee_name, t.phone AS trainee_phone, t.email AS trainee_email,
         ${programClassService.WAITLIST_POSITION_SQL('e')} AS waitlist_position
  FROM course_enrollments e
  JOIN courses c ON c.id = e.course_id
  JOIN trainees t ON t.id = e.trainee_id
  JOIN course_programs cp ON cp.course_id = @course_id AND cp.program_id = e.program_id
  WHERE e.status = 'waitlisted' AND e.course_id <> @course_id
    AND ${APPLIES_SQL('c')} AND c.status <> 'cancelled'
    -- Đã có hồ sơ cùng chương trình ở đợt này thì không gợi ý (tránh trùng)
    AND NOT EXISTS (SELECT 1 FROM course_enrollments d
                    WHERE d.course_id = @course_id AND d.trainee_id = e.trainee_id AND d.program_id = e.program_id)`;

/** Lớp của khóa áp dụng sĩ số + người chờ ở đợt trước của từng lớp. */
const listCandidates = async (courseId) => {
	const classes = (await programClassService.classesOf(courseId)).filter((k) => k.class_rule);
	if (!classes.length) return [];
	const pool = await getPool();
	const rows = (
		await pool
			.request()
			.input('course_id', sql.VarChar(20), courseId)
			.query(`${CANDIDATE_SQL} ORDER BY e.decided_at, e.registered_at, e.id`)
	).recordset;
	return classes
		.map((k) => {
			const room = roomOf(k);
			return {
				program_id: k.program_id,
				program_code: k.program_code,
				program_name: k.program_name,
				started: !!k.started,
				// null = không giới hạn
				room: Number.isFinite(room) ? room : null,
				candidates: rows.filter((r) => r.program_id === k.program_id),
			};
		})
		.filter((k) => k.candidates.length);
};

/**
 * Chuyển các hồ sơ đã chọn sang khóa này. Kiểm lại từng hồ sơ trong giao dịch (vẫn đang
 * chờ, đúng chương trình của khóa, không trùng) và không vượt chỗ trống của lớp.
 */
const transfer = async (courseId, enrollmentIds, actorId) => {
	const pool = await getPool();
	const tx = new sql.Transaction(pool);
	await tx.begin();
	const q = () => new sql.Request(tx);
	const moved = [];
	const added = new Map(); // program_id → số người, để báo lớp vừa đủ sĩ số
	const full = []; // hồ sơ không chuyển được vì lớp hết chỗ
	try {
		// Cùng khoá với fillFromWaitlist: không 2 thao tác cùng chiếm 1 chỗ trống.
		await q().query(
			"EXEC sp_getapplock @Resource = 'course-class-waitlist', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000",
		);
		const rooms = new Map(
			(await programClassService.classesOf(courseId, q))
				.filter((k) => k.class_rule)
				.map((k) => [k.program_id, roomOf(k)]),
		);
		const valid = (
			await q()
				.input('course_id', sql.VarChar(20), courseId)
				.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(enrollmentIds))
				.query(`${CANDIDATE_SQL} AND e.id IN (SELECT [value] FROM OPENJSON(@ids))
                ORDER BY e.decided_at, e.registered_at, e.id`)
		).recordset;
		for (const e of valid) {
			const room = rooms.get(e.program_id) ?? 0;
			if (room <= 0) {
				full.push(e.trainee_name);
				continue;
			}
			rooms.set(e.program_id, room - 1);
			await q()
				.input('id', sql.VarChar(20), e.id)
				.input('course_id', sql.VarChar(20), courseId)
				.input('actor_id', sql.VarChar(20), actorId).query(`
          UPDATE course_enrollments
          SET course_id = @course_id, status = 'approved', updated_at = GETDATE(), updated_by = @actor_id
          WHERE id = @id AND status = 'waitlisted'`);
			moved.push(e.id);
			added.set(e.program_id, (added.get(e.program_id) ?? 0) + 1);
		}
		if (!moved.length) {
			throw httpError(
				409,
				full.length
					? 'Lớp đã đủ sĩ số tối đa — không chuyển thêm được.'
					: 'Không còn hồ sơ chờ hợp lệ để chuyển (có thể đã được chuyển trước đó).',
			);
		}
		await tx.commit();
	} catch (err) {
		await tx.rollback().catch(() => {});
		throw err;
	}
	broadcast('update', { entity: 'course' });
	broadcast('update', { entity: 'course_enrollment' });
	programClassService.mailTrainees(
		moved,
		(r) => `Bạn đã được xếp vào lớp ${r.program_name ?? ''} — ${r.course_name}`,
		'Bạn được chuyển từ danh sách chờ vào đợt học mới. Lịch học sẽ được thông báo khi phòng Đào tạo xếp lịch.',
	);
	for (const [programId, n] of added) await programClassService.notifyIfReady(courseId, programId, n);
	return { moved: moved.length, skipped: enrollmentIds.length - moved.length, full: full.length };
};

module.exports = { listCandidates, transfer };
