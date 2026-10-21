const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const mailService = require('../../notifications/mailService');
const mailQueue = require('../../notifications/mailQueue');
const notificationService = require('../../notifications/notificationService');
const { httpError } = require('../../../utils/httpError');
const logger = require('../../../config/logger');

// Khóa tuyển sinh theo đợt (courses.auto_batch = 1, ĐTLT / CTCV) — xem
// migration 2026-11-15_course_batches. Học viên đã duyệt nằm ở danh sách chờ
// (status 'waitlisted') của khóa tuyển sinh; hàm rebalance chuyển họ sang ĐỢT
// (khóa con, 1 chương trình) theo thứ tự chờ:
//   1. lấp chỗ trống ở các đợt chưa khai giảng còn chỗ;
//   2. còn người chờ ≥ sĩ số tối thiểu của chương trình ⇒ lập đợt mới.
// Sĩ số tối thiểu / tối đa theo chương trình (min_capacity / max_capacity);
// chương trình không đặt tối đa thì dùng capacity của khóa tuyển sinh.
const VN_TODAY = 'CAST(DATEADD(HOUR, 7, GETUTCDATE()) AS DATE)';

/** Tách khỏi SQL để test được: chia người chờ vào đợt còn chỗ, phần dư lập đợt mới. */
const planPlacement = ({ waiting, openBatches, min, max, force = false }) => {
	const queue = [...waiting];
	const fills = [];
	for (const b of openBatches) {
		const room = b.capacity == null ? queue.length : Math.max(0, b.capacity - b.approved);
		if (room && queue.length) fills.push({ batchId: b.id, ids: queue.splice(0, room) });
	}
	const newBatches = [];
	while (queue.length && (queue.length >= min || (force && !newBatches.length))) {
		newBatches.push(queue.splice(0, max ?? queue.length));
	}
	return { fills, newBatches, remaining: queue };
};

const createBatch = async (q, frame, programId, capacity, actorId) => {
	const r = await q()
		.input('frame_id', sql.VarChar(20), frame.id)
		.input('program_id', sql.VarChar(20), programId)
		.input('single_program', sql.Bit, frame.program_count <= 1 ? 1 : 0)
		.input('program_name', sql.NVarChar(255), frame.program_name)
		.input('capacity', sql.Int, capacity)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      DECLARE @no INT = 1 + ISNULL((
        SELECT MAX(b.batch_no) FROM courses b
        JOIN course_programs cp ON cp.course_id = b.id AND cp.program_id = @program_id
        WHERE b.parent_course_id = @frame_id), 0);
      DECLARE @new_id VARCHAR(20), @cp_id VARCHAR(20);
      EXEC sp_gen_course_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      EXEC sp_set_actor @actor_id;
      INSERT INTO courses (id, name, training_form_id, training_type_id, batch_no, is_rolling, capacity, status,
                           is_public_registration, description, prerequisites, objectives, plan_item_id,
                           parent_course_id, created_by)
      SELECT @new_id,
             LEFT(CONCAT(CASE WHEN @single_program = 1 THEN f.name ELSE @program_name END, N' – Đợt ', @no), 255),
             f.training_form_id, f.training_type_id, @no, 0, @capacity, 'draft',
             0, f.description, f.prerequisites, f.objectives, f.plan_item_id, f.id, @actor_id
      FROM courses f WHERE f.id = @frame_id;
      EXEC sp_gen_course_program_id @actor_id = @actor_id, @new_id = @cp_id OUTPUT;
      INSERT INTO course_programs (id, course_id, program_id, status, created_by)
      VALUES (@cp_id, @new_id, @program_id, 'active', @actor_id);
      SELECT id, name, batch_no FROM courses WHERE id = @new_id;
    `);
	return r.recordset[0];
};

const moveInto = async (q, batchId, ids, actorId) => {
	if (!ids.length) return;
	await q()
		.input('batch_id', sql.VarChar(20), batchId)
		.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
		.input('actor_id', sql.VarChar(20), actorId).query(`
      UPDATE course_enrollments
      SET course_id = @batch_id, status = 'approved', updated_at = GETDATE(), updated_by = @actor_id
      WHERE id IN (SELECT [value] FROM OPENJSON(@ids)) AND status = 'waitlisted'
    `);
};

// Báo học viên được chuyển vào đợt + cán bộ tạo khóa tuyển sinh khi lập đợt mới.
const notify = async (frame, moved, formed) => {
	if (moved.length) {
		const pool = await getPool();
		const rows = (
			await pool.request().input('ids', sql.NVarChar(sql.MAX), JSON.stringify(moved.map((m) => m.enrollmentId)))
				.query(`
        SELECT e.id, t.full_name, t.email, c.name AS batch_name
        FROM course_enrollments e JOIN trainees t ON t.id = e.trainee_id JOIN courses c ON c.id = e.course_id
        WHERE e.id IN (SELECT [value] FROM OPENJSON(@ids)) AND t.email IS NOT NULL AND t.email <> ''`)
		).recordset;
		for (const r of rows) {
			const title = `Bạn đã được xếp vào ${r.batch_name}`;
			mailQueue.enqueue('xếp đợt học', () =>
				mailService.send({
					event: 'COURSE_ENROLLMENT',
					to: r.email,
					subject: title,
					html: mailService.renderNotificationEmail({
						fullName: r.full_name,
						title,
						message: 'Lịch học sẽ được thông báo khi cán bộ đào tạo xếp lịch.',
					}),
				}),
			);
		}
	}
	for (const b of formed) {
		await notificationService.push('course_batch', `Đã lập ${b.name}`, frame.created_by ? [frame.created_by] : [], {
			message: `Đủ ${b.count} học viên — cần xếp lịch học.`,
			refId: b.id,
			refType: 'course',
		});
	}
};

/**
 * Xếp người chờ của 1 chương trình vào đợt. force: lập đợt ngay dù chưa đủ sĩ số
 * tối thiểu (nút "Lập đợt ngay"). Khóa không phải khóa tuyển sinh ⇒ không làm gì.
 */
const rebalance = async (frameId, programId, actorId, { force = false } = {}) => {
	if (!frameId || !programId) return { formed: [], moved: [] };
	const pool = await getPool();
	const tx = new sql.Transaction(pool);
	await tx.begin();
	const q = () => new sql.Request(tx);
	let frame;
	const formed = [];
	const moved = [];
	try {
		// Khoá theo (khóa tuyển sinh, chương trình): 2 lượt duyệt cùng lúc không
		// vượt sĩ số / không lập trùng 2 đợt.
		await q()
			.input('res', sql.NVarChar(255), `course-batch:${frameId}:${programId}`)
			.query(
				"EXEC sp_getapplock @Resource = @res, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000",
			);
		frame = (
			await q().input('frame_id', sql.VarChar(20), frameId).input('program_id', sql.VarChar(20), programId)
				.query(`
        SELECT c.id, c.name, c.capacity, c.created_by, tp.name AS program_name,
               tp.min_capacity, tp.max_capacity,
               (SELECT COUNT(*) FROM course_programs x WHERE x.course_id = c.id) AS program_count
        FROM courses c
        JOIN course_programs cp ON cp.course_id = c.id AND cp.program_id = @program_id
        JOIN training_programs tp ON tp.id = cp.program_id
        WHERE c.id = @frame_id AND c.auto_batch = 1 AND c.status <> 'cancelled'`)
		).recordset[0];
		if (!frame) {
			await tx.commit();
			return { formed, moved };
		}
		const min = Math.max(1, frame.min_capacity ?? 1);
		const max = frame.max_capacity ?? frame.capacity ?? null;

		const waiting = (
			await q().input('frame_id', sql.VarChar(20), frameId).input('program_id', sql.VarChar(20), programId)
				.query(`
        SELECT id FROM course_enrollments
        WHERE course_id = @frame_id AND program_id = @program_id AND status = 'waitlisted'
        ORDER BY decided_at, registered_at, id`)
		).recordset.map((r) => r.id);
		if (!waiting.length) {
			await tx.commit();
			return { formed, moved };
		}
		const openBatches = (
			await q().input('frame_id', sql.VarChar(20), frameId).input('program_id', sql.VarChar(20), programId)
				.query(`
        SELECT b.id, b.capacity,
               (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = b.id AND e.status = 'approved') AS approved
        FROM courses b
        JOIN course_programs cp ON cp.course_id = b.id AND cp.program_id = @program_id
        WHERE b.parent_course_id = @frame_id AND b.status <> 'cancelled'
          AND (b.start_date IS NULL OR b.start_date > ${VN_TODAY})
        ORDER BY b.batch_no`)
		).recordset;

		const plan = planPlacement({ waiting, openBatches, min, max, force });
		for (const f of plan.fills) {
			await moveInto(q, f.batchId, f.ids, actorId);
			moved.push(...f.ids.map((enrollmentId) => ({ enrollmentId, batchId: f.batchId })));
		}
		for (const ids of plan.newBatches) {
			const b = await createBatch(q, frame, programId, max, actorId);
			await moveInto(q, b.id, ids, actorId);
			formed.push({ ...b, count: ids.length });
			moved.push(...ids.map((enrollmentId) => ({ enrollmentId, batchId: b.id })));
		}
		await tx.commit();
	} catch (err) {
		await tx.rollback().catch(() => {});
		throw err;
	}
	if (moved.length) {
		broadcast('update', { entity: 'course' });
		broadcast('update', { entity: 'course_enrollment' });
		// Thư đi qua mailQueue (không chờ SMTP) — chỉ chờ 1 truy vấn + thông báo nội bộ.
		await notify(frame, moved, formed).catch((err) => logger.error('[course-batch] notify failed:', err.message));
	}
	return { formed, moved };
};

/** Khóa tuyển sinh của 1 khóa: chính nó (auto_batch) hoặc cha của đợt. */
const frameIdOf = async (courseId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), courseId)
		.query('SELECT id, auto_batch, parent_course_id FROM courses WHERE id = @id');
	const c = r.recordset[0];
	if (!c) return null;
	return c.auto_batch ? c.id : c.parent_course_id;
};

// Vị trí trong danh sách chờ (1 = đầu hàng) của 1 lượt đăng ký 'waitlisted'.
const WAITLIST_POSITION_SQL = (e) => `(SELECT COUNT(*) FROM course_enrollments w
    WHERE w.course_id = ${e}.course_id AND w.status = 'waitlisted'
      AND ISNULL(w.program_id, '') = ISNULL(${e}.program_id, '')
      AND (w.decided_at < ${e}.decided_at OR (w.decided_at = ${e}.decided_at AND w.id <= ${e}.id)))`;

/** Tổng quan khóa tuyển sinh: theo từng chương trình — sĩ số, người chờ, các đợt. */
const overview = async (frameId) => {
	const { COURSE_DISPLAY_STATUS } = require('./courseService'); // muộn: courseService cũng require file này
	const pool = await getPool();
	const r = await pool.request().input('frame_id', sql.VarChar(20), frameId).query(`
    SELECT tp.id AS program_id, tp.code AS program_code, tp.name AS program_name,
           tp.min_capacity, tp.max_capacity,
           (SELECT COUNT(*) FROM course_enrollments e
             WHERE e.course_id = @frame_id AND e.program_id = tp.id AND e.status = 'waitlisted') AS waiting,
           (SELECT COUNT(*) FROM course_enrollments e
             WHERE e.course_id = @frame_id AND e.program_id = tp.id AND e.status = 'pending') AS pending
    FROM course_programs cp
    JOIN training_programs tp ON tp.id = cp.program_id
    WHERE cp.course_id = @frame_id
    ORDER BY tp.name;

    SELECT c.id, c.name, c.batch_no, c.capacity, c.start_date, c.end_date, cp.program_id,
           ${COURSE_DISPLAY_STATUS} AS display_status,
           (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id AND e.status = 'approved') AS approved_count
    FROM courses c
    JOIN course_programs cp ON cp.course_id = c.id
    WHERE c.parent_course_id = @frame_id
    ORDER BY c.batch_no;
  `);
	const [programs, batches] = r.recordsets;
	return programs.map((p) => ({
		...p,
		capacity: p.max_capacity,
		min: Math.max(1, p.min_capacity ?? 1),
		batches: batches.filter((b) => b.program_id === p.program_id),
	}));
};

const formNow = async (frameId, programId, actorId) => {
	const frame = await frameIdOf(frameId);
	if (frame !== frameId) throw httpError(400, 'Đây không phải khóa tuyển sinh theo đợt.');
	const result = await rebalance(frameId, programId, actorId, { force: true });
	if (!result.moved.length) throw httpError(400, 'Không có học viên nào đang chờ xếp đợt cho chương trình này.');
	return result;
};

module.exports = { planPlacement, rebalance, frameIdOf, overview, formNow, WAITLIST_POSITION_SQL };
