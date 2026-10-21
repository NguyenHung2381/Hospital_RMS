const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { paging } = require('../../../utils/paging');
const { scopeOf } = require('../../../permissions/authz');
const { todayVN } = require('../../../utils/vnDate');
const { httpError } = require('../../../utils/httpError');
const { ASSIGNED_EXISTS_SQL } = require('./coursePolicy');
const programClassService = require('./programClassService');

// Mỗi khóa học tự có cửa sổ đăng ký riêng (enrollment_start/end_date) và tự
// quyết định có công khai trên cổng đăng ký không cần đăng nhập hay không
// (is_public_registration) — xem 2026-09-15_course_enrollment_window và
// 2026-09-20_drop_training_rounds.
const isEnrollmentOpenRow = (c) => {
	if (c.is_rolling) return true; // khóa mở liên tục (GPHN) — nhận học viên bất cứ lúc nào
	if (c.auto_batch) return true; // khóa tuyển sinh theo đợt — đăng ký liên tục
	if (!c.enrollment_start_date && !c.enrollment_end_date) return true; // chưa cấu hình = mở
	const today = todayVN();
	const afterStart = !c.enrollment_start_date || today >= new Date(c.enrollment_start_date);
	const beforeEnd = !c.enrollment_end_date || today <= new Date(c.enrollment_end_date);
	return afterStart && beforeEnd;
};

// prerequisites/objectives lưu dạng chuỗi JSON (mảng string) — parse lại cho FE.
const parseJsonList = (v) => {
	if (!v) return [];
	try {
		const parsed = JSON.parse(v);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
};

// Trạng thái hiển thị được suy ra hoàn toàn từ ngày tháng thay vì để người
// dùng tự chọn tay (dễ quên cập nhật) — cột courses.status giờ chỉ còn dùng
// để lưu cờ 'cancelled' (huỷ khóa học), đây là lựa chọn duy nhất không thể
// suy ra từ ngày tháng nên vẫn cần override thủ công.
const computeDisplayStatus = (c, enrollmentOpen) => {
	if (c.status === 'cancelled') return 'cancelled';
	// Khóa mở liên tục (GPHN): không có ngày khóa — học viên vào/ra theo lịch riêng.
	if (c.is_rolling) return 'in_progress';
	if (c.auto_batch) return 'enrolling'; // khóa tuyển sinh: luôn nhận đăng ký, lớp học ở các đợt
	if (c.parent_course_id && !c.start_date) return 'awaiting_schedule'; // đợt vừa lập, chưa có lịch
	const today = todayVN();
	const startDate = c.start_date ? new Date(c.start_date) : null;
	const endDate = c.end_date ? new Date(c.end_date) : null;
	if (endDate && today > endDate) return 'completed';
	if (startDate && today >= startDate && (!endDate || today <= endDate)) return 'in_progress';
	if (enrollmentOpen) return 'enrolling';
	return 'upcoming';
};

// Bản SQL của computeDisplayStatus (ngày giờ VN) — dùng trong thống kê/báo cáo.
const VN_TODAY = 'CAST(DATEADD(HOUR, 7, GETUTCDATE()) AS DATE)';
const COURSE_DISPLAY_STATUS = `CASE
    WHEN c.status = 'cancelled' THEN 'cancelled'
    WHEN c.is_rolling = 1 THEN 'in_progress'
    WHEN c.auto_batch = 1 THEN 'enrolling'
    WHEN c.parent_course_id IS NOT NULL AND c.start_date IS NULL THEN 'awaiting_schedule'
    WHEN c.end_date IS NOT NULL AND ${VN_TODAY} > c.end_date THEN 'completed'
    WHEN c.start_date IS NOT NULL AND ${VN_TODAY} >= c.start_date THEN 'in_progress'
    WHEN (c.enrollment_start_date IS NULL OR ${VN_TODAY} >= c.enrollment_start_date)
     AND (c.enrollment_end_date IS NULL OR ${VN_TODAY} <= c.enrollment_end_date) THEN 'enrolling'
    ELSE 'upcoming'
  END`;

const normalize = (c) => {
	const enrollmentOpen = isEnrollmentOpenRow(c);
	return {
		...c,
		enrollment_open: enrollmentOpen,
		display_status: computeDisplayStatus(c, enrollmentOpen),
		prerequisites: parseJsonList(c.prerequisites),
		objectives: parseJsonList(c.objectives),
		program_ids: c.program_ids ? c.program_ids.split(',') : [],
	};
};

// Quan hệ course<->training_program là N:N qua bảng bridge course_programs
// (xem 2026-09-16_course_programs_bridge.sql), gán bằng program_ids của form
// khóa học.
const courseSelect = `
  SELECT c.*,
         tf.name AS training_form_name,
         tt.name AS training_type_name,
         (SELECT STRING_AGG(cp.program_id, ',') FROM course_programs cp WHERE cp.course_id = c.id) AS program_ids,
         (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id) AS enrollment_count,
         (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id AND status = 'approved') AS approved_count,
         (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id AND status = 'pending') AS pending_count,
         (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id AND status = 'waitlisted') AS waitlisted_count,
         (SELECT COUNT(*) FROM courses b WHERE b.parent_course_id = c.id) AS batch_count,
         -- Tổng học viên toàn khóa tuyển sinh: đang chờ / chờ duyệt ở khóa + đã vào các đợt
         (SELECT COUNT(*) FROM course_enrollments e WHERE e.status <> 'rejected'
            AND (e.course_id = c.id OR e.course_id IN (SELECT b.id FROM courses b WHERE b.parent_course_id = c.id))) AS family_count,
         pc.name AS parent_course_name,
         (SELECT STRING_AGG(tp.name, ', ') FROM course_programs cp JOIN training_programs tp ON tp.id = cp.program_id WHERE cp.course_id = c.id) AS program_names
  FROM courses c
  LEFT JOIN training_forms tf ON tf.id = c.training_form_id
  LEFT JOIN training_types tt ON tt.id = c.training_type_id
  LEFT JOIN courses pc ON pc.id = c.parent_course_id
`;

// ─── Courses ──────────────────────────────────────────────────────────────
const getAll = async (
	{
		page = 1,
		limit = 20,
		search = undefined,
		program_id = undefined,
		status = undefined,
		training_type_id = undefined,
		parent_course_id = undefined,
	} = {},
	actor = null,
) => {
	const pool = await getPool();
	const pg = paging(page, limit, 100);
	const where = ['1=1'];
	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);
	// Đợt của khóa tuyển sinh nằm trong chi tiết khóa đó — danh sách chính ẩn đi
	// (trừ khi tìm theo tên, để gõ "Đợt 2" vẫn ra).
	if (parent_course_id) {
		where.push('c.parent_course_id = @parent_course_id');
		req.input('parent_course_id', sql.VarChar(20), parent_course_id);
	} else if (!search) {
		where.push('c.parent_course_id IS NULL');
	}

	if (search) {
		where.push('c.name LIKE @search');
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	if (program_id) {
		where.push(
			'EXISTS (SELECT 1 FROM course_programs cp WHERE cp.course_id = c.id AND cp.program_id = @program_id)',
		);
		req.input('program_id', sql.VarChar(20), program_id);
	}
	if (status) {
		where.push('c.status = @status');
		req.input('status', sql.VarChar(15), status);
	}
	if (actor && scopeOf(actor, 'courses') === 'assigned') {
		where.push(ASSIGNED_EXISTS_SQL);
		req.input('actor_id', sql.VarChar(20), actor.id);
	}
	// Đếm theo loại khóa (cho tab) với mọi bộ lọc trừ chính loại khóa.
	const countWhereSql = `WHERE ${where.join(' AND ')}`;
	if (training_type_id) {
		where.push('c.training_type_id = @training_type_id');
		req.input('training_type_id', sql.VarChar(20), training_type_id);
	}
	const whereSql = `WHERE ${where.join(' AND ')}`;

	const result = await req.query(`
    ${courseSelect} ${whereSql} ORDER BY c.created_at DESC
    ${pg.fetchClause};
    SELECT COUNT(*) AS total FROM courses c ${whereSql};
    SELECT c.training_type_id, COUNT(*) AS total FROM courses c ${countWhereSql} GROUP BY c.training_type_id;
  `);
	return {
		data: result.recordsets[0].map(normalize),
		pagination: { page: pg.page, limit: pg.limit, total: result.recordsets[1][0].total },
		// '' = tất cả loại (gồm khóa chưa gán loại)
		type_counts: result.recordsets[2].reduce(
			(acc, r) => {
				acc[''] += r.total;
				if (r.training_type_id) acc[r.training_type_id] = r.total;
				return acc;
			},
			{ '': 0 },
		),
	};
};

const getById = async (id, actor = null) => {
	const pool = await getPool();
	if (actor && scopeOf(actor, 'courses') === 'assigned') {
		const access = await pool
			.request()
			.input('id', sql.VarChar(20), id)
			.input('actor_id', sql.VarChar(20), actor.id)
			.query(`SELECT 1 AS ok FROM courses c WHERE c.id = @id AND ${ASSIGNED_EXISTS_SQL}`);
		if (!access.recordset[0]) {
			throw httpError(403, 'Không có quyền xem khóa học này');
		}
	}
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query(`${courseSelect} WHERE c.id = @id`);
	return result.recordset[0] ? normalize(result.recordset[0]) : null;
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('name', sql.NVarChar(255), data.name)
		.input('training_form_id', sql.VarChar(20), data.training_form_id || null)
		.input('training_type_id', sql.VarChar(20), data.training_type_id || null)
		.input('batch_no', sql.Int, data.batch_no || null)
		.input('is_rolling', sql.Bit, data.is_rolling ? 1 : 0)
		.input('auto_batch', sql.Bit, data.auto_batch ? 1 : 0)
		.input('start_date', sql.Date, data.start_date || null)
		.input('end_date', sql.Date, data.end_date || null)
		.input('enrollment_start_date', sql.Date, data.enrollment_start_date || null)
		.input('enrollment_end_date', sql.Date, data.enrollment_end_date || null)
		.input('capacity', sql.Int, data.capacity || null)
		.input('status', sql.VarChar(15), data.status || 'draft')
		.input('is_public_registration', sql.Bit, data.is_public_registration ? 1 : 0)
		.input('description', sql.NVarChar(sql.MAX), data.description || null)
		.input('prerequisites', sql.NVarChar(sql.MAX), JSON.stringify(data.prerequisites || []))
		.input('objectives', sql.NVarChar(sql.MAX), JSON.stringify(data.objectives || [])).query(`
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_course_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      EXEC sp_set_actor @actor_id;
      INSERT INTO courses (id, name, training_form_id, training_type_id, batch_no, is_rolling, auto_batch, start_date, end_date, enrollment_start_date, enrollment_end_date, capacity, status, is_public_registration, description, prerequisites, objectives, created_by)
      VALUES (@new_id, @name, @training_form_id, @training_type_id, @batch_no, @is_rolling, @auto_batch, @start_date, @end_date, @enrollment_start_date, @enrollment_end_date, @capacity, @status, @is_public_registration, @description, @prerequisites, @objectives, @actor_id);
      SELECT @new_id AS id;
    `);
	const id = result.recordset[0].id;
	if (Array.isArray(data.program_ids)) await setPrograms(id, data.program_ids, actorId);
	broadcast('update', { entity: 'course' });
	const saved = await getById(id);
	// Khóa ĐTLT mới ⇒ nhận hồ sơ đang chờ ("lưu cho khóa sau") của khóa trước.
	await programClassService.refreshCourse(saved, actorId);
	return programClassService.appliesTo(saved) ? getById(id) : saved;
};

const update = async (id, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId);

	const fieldMap = {
		name: sql.NVarChar(255),
		training_form_id: sql.VarChar(20),
		training_type_id: sql.VarChar(20),
		batch_no: sql.Int,
		is_rolling: sql.Bit,
		auto_batch: sql.Bit,
		start_date: sql.Date,
		end_date: sql.Date,
		enrollment_start_date: sql.Date,
		enrollment_end_date: sql.Date,
		capacity: sql.Int,
		status: sql.VarChar(15),
		is_public_registration: sql.Bit,
		description: sql.NVarChar(sql.MAX),
	};
	for (const [field, type] of Object.entries(fieldMap)) {
		if (data[field] !== undefined) {
			sets.push(`${field} = @${field}`);
			req.input(field, type, data[field] === '' ? null : data[field]);
		}
	}
	if (data.prerequisites !== undefined) {
		sets.push('prerequisites = @prerequisites');
		req.input('prerequisites', sql.NVarChar(sql.MAX), JSON.stringify(data.prerequisites || []));
	}
	if (data.objectives !== undefined) {
		sets.push('objectives = @objectives');
		req.input('objectives', sql.NVarChar(sql.MAX), JSON.stringify(data.objectives || []));
	}

	await req.query(
		`EXEC sp_set_actor @actor_id; UPDATE courses SET ${sets.join(', ')} WHERE id = @id`,
	);
	if (Array.isArray(data.program_ids)) await setPrograms(id, data.program_ids, actorId);
	broadcast('update', { entity: 'course' });
	const saved = await getById(id);
	// Tăng sĩ số đợt chưa khai giảng ⇒ gọi thêm người chờ vào cho đủ chỗ.
	if (saved?.parent_course_id && data.capacity !== undefined && saved.program_ids[0]) {
		await require('./courseBatchService').rebalance(saved.parent_course_id, saved.program_ids[0], actorId);
	}
	// Khóa ĐTLT: tăng sĩ số / thêm chương trình / dời ngày ⇒ gọi người chờ vào, nhận hồ sơ khóa trước.
	if (programClassService.appliesTo(saved)) {
		await programClassService.refreshCourse(saved, actorId);
		return getById(id);
	}
	return saved;
};

const remove = async (id, actorId) => {
	const pool = await getPool();
	const children = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query('SELECT COUNT(*) AS n FROM courses WHERE parent_course_id = @id');
	if (children.recordset[0].n > 0) {
		throw httpError(400, 'Khóa tuyển sinh còn các đợt học — xoá các đợt trước.');
	}
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId)
		.query('EXEC sp_set_actor @actor_id; DELETE FROM courses WHERE id = @id');
	broadcast('update', { entity: 'course' });
};

// ─── Chương trình đào tạo áp dụng (course_programs, N:N) ────────────────
const listProgramLinks = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT cp.id, cp.course_id, cp.program_id, tp.name AS program_name, tp.code AS program_code,
           tp.training_type_id, tp.duration AS program_duration,
           ${programClassService.CLASS_COLUMNS}
    FROM course_programs cp
    JOIN training_programs tp ON tp.id = cp.program_id
    JOIN courses c ON c.id = cp.course_id
    WHERE cp.course_id = @course_id
    ORDER BY cp.created_at
  `);
	// class_rule: khóa ĐTLT thường — lớp mở khi đủ class_min, đầy ở class_max (xem programClassService)
	return r.recordset.map(({ class_rule, ...l }) => ({ ...l, class_rule: !!class_rule }));
};

// Đồng bộ theo danh sách chọn ở form khóa học: gỡ chương trình bị bỏ, gắn chương trình mới.
const setPrograms = async (courseId, programIds, actorId) => {
	const pool = await getPool();
	const wanted = new Set(programIds.filter(Boolean).map(String));
	const current = (
		await pool
			.request()
			.input('course_id', sql.VarChar(20), courseId)
			.query('SELECT id, program_id FROM course_programs WHERE course_id = @course_id')
	).recordset;
	for (const link of current.filter((l) => !wanted.has(l.program_id))) {
		await pool
			.request()
			.input('id', sql.VarChar(20), link.id)
			.query('DELETE FROM course_programs WHERE id = @id');
	}
	const have = new Set(current.map((l) => l.program_id));
	for (const programId of [...wanted].filter((id) => !have.has(id))) {
		await pool
			.request()
			.input('actor_id', sql.VarChar(20), actorId)
			.input('course_id', sql.VarChar(20), courseId)
			.input('program_id', sql.VarChar(20), programId).query(`
        IF EXISTS (SELECT 1 FROM training_programs WHERE id = @program_id)
        BEGIN
          DECLARE @new_id VARCHAR(20);
          EXEC sp_gen_course_program_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
          INSERT INTO course_programs (id, course_id, program_id, status, created_by)
          VALUES (@new_id, @course_id, @program_id, 'active', @actor_id);
        END
      `);
	}
};

module.exports = {
	isEnrollmentOpenRow,
	computeDisplayStatus,
	COURSE_DISPLAY_STATUS,
	getAll,
	getById,
	create,
	update,
	remove,
	listProgramLinks,
};
