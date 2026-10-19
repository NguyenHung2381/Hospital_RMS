const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { paging } = require('../../../utils/paging');
const trainingFileService = require('../trainingFileService');
const { assertHttpUrl } = require('../../../utils/safeUrl');
const { httpError } = require('../../../utils/httpError');
const { formatDuration, UNITS } = require('../../../utils/trainingDuration');

// Cột ghi được của training_programs (create + update dùng chung). duration
// (văn bản) tự sinh từ duration_value/unit khi có — xem withDurationText.
const PROGRAM_FIELDS = {
	name: sql.NVarChar(255),
	code: sql.NVarChar(50),
	duration: sql.NVarChar(100),
	duration_value: sql.Decimal(6, 2),
	duration_unit: sql.VarChar(10),
	department_id: sql.VarChar(20),
	department_note: sql.NVarChar(255),
	trainee_type_id: sql.VarChar(20),
	training_type_id: sql.VarChar(20),
	target_audience: sql.NVarChar(300),
	theory_hours: sql.Int,
	practice_hours: sql.Int,
	credit_hours: sql.Decimal(6, 1),
	tuition_fee: sql.Decimal(18, 0),
	max_capacity: sql.Int,
	display_order: sql.Int,
	description: sql.NVarChar(sql.MAX),
};

const LESSON_FIELDS = {
	code: sql.NVarChar(50),
	title: sql.NVarChar(255),
	description: sql.NVarChar(sql.MAX),
	theory_hours: sql.Int,
	practice_hours: sql.Int,
	credits: sql.Int,
	lesson_kind: sql.VarChar(10),
	duration_value: sql.Decimal(6, 2),
	duration_unit: sql.VarChar(10),
};

const emptyToNull = (v) => (v === '' || v === undefined ? null : v);

const withDurationText = (data) => {
	if (data.duration_unit !== undefined && data.duration_unit && !UNITS.includes(data.duration_unit))
		throw httpError(400, 'Đơn vị thời lượng không hợp lệ');
	if (data.duration_value === undefined) return data;
	const text = formatDuration(data.duration_value || null, data.duration_unit);
	return { ...data, duration: text ?? data.duration ?? null };
};

const programSelect = `
  SELECT p.*, d.name AS department_name, tt.name AS trainee_type_name, tp.name AS training_type_name,
         (SELECT COUNT(*) FROM course_programs cp WHERE cp.program_id = p.id) AS course_count,
         (SELECT COUNT(*) FROM lesson_programs lp WHERE lp.program_id = p.id) AS lesson_count
  FROM training_programs p
  LEFT JOIN departments d ON d.id = p.department_id
  LEFT JOIN trainee_types tt ON tt.id = p.trainee_type_id
  LEFT JOIN training_types tp ON tp.id = p.training_type_id
`;

const getAll = async ({
	page = 1,
	limit = 20,
	search = undefined,
	department_id = undefined,
	training_type_id = undefined,
} = {}) => {
	const pool = await getPool();
	const pg = paging(page, limit, 100);
	const where = ['1=1'];
	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);

	if (search) {
		where.push('(p.name LIKE @search OR p.code LIKE @search OR p.description LIKE @search)');
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	if (department_id) {
		where.push('p.department_id = @department_id');
		req.input('department_id', sql.VarChar(20), department_id);
	}
	if (training_type_id) {
		where.push('p.training_type_id = @training_type_id');
		req.input('training_type_id', sql.VarChar(20), training_type_id);
	}
	const whereSql = `WHERE ${where.join(' AND ')}`;

	const result = await req.query(`
    ${programSelect} ${whereSql} ORDER BY p.display_order ASC, p.created_at DESC
    ${pg.fetchClause};
    SELECT COUNT(*) AS total FROM training_programs p ${whereSql};
  `);
	return {
		data: result.recordsets[0],
		pagination: { page: pg.page, limit: pg.limit, total: result.recordsets[1][0].total },
	};
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query(`${programSelect} WHERE p.id = @id`);
	const row = result.recordset[0];
	return row ?? null;
};

// Vi phạm UQ_trprog_code (mã chương trình trùng) → 409 thay vì 500.
const rethrowDuplicateCode = (err) => {
	if (err.number === 2601 || err.number === 2627)
		throw httpError(409, 'Mã chương trình đã tồn tại.');
	throw err;
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const input = withDurationText(data);
	const req = pool.request().input('actor_id', sql.VarChar(20), actorId);
	const cols = [];
	for (const [field, type] of Object.entries(PROGRAM_FIELDS)) {
		cols.push(field);
		req.input(
			field,
			type,
			field === 'display_order' ? input[field] || 0 : emptyToNull(input[field]),
		);
	}
	const result = await req
		.query(
			`
      DECLARE @new_id VARCHAR(20) = 'CT' + LEFT(REPLACE(NEWID(),'-',''), 18);
      EXEC sp_set_actor @actor_id;
      INSERT INTO training_programs (id, ${cols.join(', ')}, created_by)
      VALUES (@new_id, ${cols.map((c) => `@${c}`).join(', ')}, @actor_id);
      SELECT @new_id AS id;
    `,
		)
		.catch(rethrowDuplicateCode);
	const id = result.recordset[0].id;
	broadcast('update', { entity: 'training_program' });
	return getById(id);
};

const update = async (id, data, actorId) => {
	const pool = await getPool();
	const input = withDurationText(data);
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId);

	for (const [field, type] of Object.entries(PROGRAM_FIELDS)) {
		if (input[field] === undefined) continue;
		sets.push(`${field} = @${field}`);
		const value = field === 'display_order' ? input[field] || 0 : emptyToNull(input[field]);
		req.input(field, type, value);
	}

	if (sets.length > 2)
		await req
			.query(
				`EXEC sp_set_actor @actor_id; UPDATE training_programs SET ${sets.join(', ')} WHERE id = @id`,
			)
			.catch(rethrowDuplicateCode);
	broadcast('update', { entity: 'training_program' });
	return getById(id);
};

const remove = async (id, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId)
		.query('EXEC sp_set_actor @actor_id; DELETE FROM training_programs WHERE id = @id');
	broadcast('update', { entity: 'training_program' });
};

// ─── Bài học (program_lessons) ─────────────────────────────────────────────
// Nội dung DÙNG CHUNG, tách khỏi ngày giờ cụ thể (khác class_sessions của
// courseService, vốn là lịch học 1 khóa cụ thể). 1 bài học có thể được NHIỀU
// chương trình đào tạo cùng sử dụng lại — quan hệ N:N qua bảng bridge
// lesson_programs (mirror course_programs), display_order thuộc về từng lượt
// gắn (khác chương trình có thể sắp cùng 1 bài học ở thứ tự khác nhau), KHÔNG
// thuộc riêng bài học — xem 2026-09-18_lesson_programs_bridge. title/
// description do đó dùng chung: sửa ở đâu cũng ảnh hưởng mọi chương trình
// đang dùng bài học đó.
//
// Bài học loại 'rotation' là 1 vòng thực hành GPHN: có thời lượng và danh sách
// khoa được chọn (lesson_departments) — xem 2026-11-07_training_course_types_rotations.
const lessonDepartmentsSql = `
           (SELECT STRING_AGG(ld.department_id, ',') WITHIN GROUP (ORDER BY ld.display_order)
              FROM lesson_departments ld WHERE ld.lesson_id = pl.id) AS department_ids,
           (SELECT STRING_AGG(d.name, ', ') WITHIN GROUP (ORDER BY ld.display_order)
              FROM lesson_departments ld JOIN departments d ON d.id = ld.department_id
              WHERE ld.lesson_id = pl.id) AS department_names`;

// Gán lại toàn bộ khoa của 1 vòng (thứ tự = vị trí trong mảng).
const setLessonDepartments = async (lessonId, departmentIds) => {
	const pool = await getPool();
	const ids = [...new Set((departmentIds || []).filter(Boolean))];
	await pool
		.request()
		.input('lesson_id', sql.VarChar(20), lessonId)
		.query('DELETE FROM lesson_departments WHERE lesson_id = @lesson_id');
	for (let i = 0; i < ids.length; i++) {
		await pool
			.request()
			.input('lesson_id', sql.VarChar(20), lessonId)
			.input('department_id', sql.VarChar(20), ids[i])
			.input('display_order', sql.Int, i).query(`
        IF EXISTS (SELECT 1 FROM departments WHERE id = @department_id)
          INSERT INTO lesson_departments (lesson_id, department_id, display_order)
          VALUES (@lesson_id, @department_id, @display_order);
      `);
	}
};

const assertLessonInput = (data) => {
	if (data.lesson_kind !== undefined && !['theory', 'rotation'].includes(data.lesson_kind))
		throw httpError(400, 'Loại bài học không hợp lệ');
	if (data.duration_unit && !UNITS.includes(data.duration_unit))
		throw httpError(400, 'Đơn vị thời lượng không hợp lệ');
};

const listLessons = async (programId) => {
	const pool = await getPool();
	const r = await pool.request().input('program_id', sql.VarChar(20), programId).query(`
    SELECT lp.id, lp.program_id, lp.display_order,
           pl.id AS lesson_id, pl.code, pl.title, pl.description, pl.is_active,
           pl.theory_hours, pl.practice_hours, pl.total_hours, pl.credits, pl.created_at,
           pl.lesson_kind, pl.duration_value, pl.duration_unit, pl.allow_split,
           ${lessonDepartmentsSql}
    FROM lesson_programs lp
    JOIN program_lessons pl ON pl.id = lp.lesson_id
    WHERE lp.program_id = @program_id
    ORDER BY lp.display_order ASC, pl.created_at ASC
  `);
	return r.recordset;
};

// Toàn bộ bài học đang có (không phân biệt chương trình) — nguồn cho picker
// "đính kèm bài học có sẵn" ở FE, để tái dùng thay vì tạo trùng nội dung.
// program_names: hiển thị nhanh đang thuộc chương trình nào (mirror cách
// courseService.js (courseSelect) làm với program_names qua STRING_AGG).
const listAllLessons = async () => {
	const pool = await getPool();
	const r = await pool.request().query(`
    SELECT pl.*, ${lessonDepartmentsSql},
           (SELECT STRING_AGG(tp.name, ', ') FROM lesson_programs lp JOIN training_programs tp ON tp.id = lp.program_id WHERE lp.lesson_id = pl.id) AS program_names,
           (SELECT STRING_AGG(lp.program_id, ',') FROM lesson_programs lp WHERE lp.lesson_id = pl.id) AS program_ids
    FROM program_lessons pl
    ORDER BY pl.title ASC
  `);
	return r.recordset;
};

// Tạo bài học mới — KHÔNG còn gắn sẵn vào 1 chương trình cụ thể (khác bản cũ);
// gán chương trình là bước riêng qua setLessonPrograms, để form sửa/tạo bài
// học có thể chọn nhiều chương trình cùng lúc (multi-select) ngay từ đầu.
const createLesson = async (data, actorId) => {
	assertLessonInput(data);
	const pool = await getPool();
	const result = await pool
		.request()
		.input('code', sql.NVarChar(50), data.code || '')
		.input('title', sql.NVarChar(255), data.title)
		.input('description', sql.NVarChar(sql.MAX), data.description || null)
		.input('is_active', sql.Bit, data.is_active === false ? 0 : 1)
		.input('theory_hours', sql.Int, data.theory_hours || 0)
		.input('practice_hours', sql.Int, data.practice_hours || 0)
		.input('credits', sql.Int, data.credits || 0)
		.input('lesson_kind', sql.VarChar(10), data.lesson_kind || 'theory')
		.input('duration_value', sql.Decimal(6, 2), data.duration_value || null)
		.input(
			'duration_unit',
			sql.VarChar(10),
			data.duration_value ? data.duration_unit || null : null,
		)
		.input('allow_split', sql.Bit, data.allow_split ? 1 : 0)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      DECLARE @lesson_id VARCHAR(20) = 'BL' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO program_lessons (id, code, title, description, is_active, theory_hours, practice_hours, credits,
                                   lesson_kind, duration_value, duration_unit, allow_split, created_by)
      VALUES (@lesson_id, @code, @title, @description, @is_active, @theory_hours, @practice_hours, @credits,
              @lesson_kind, @duration_value, @duration_unit, @allow_split, @actor_id);
      SELECT @lesson_id AS id;
    `);
	const id = result.recordset[0].id;
	if (Array.isArray(data.department_ids)) await setLessonDepartments(id, data.department_ids);
	broadcast('update', { entity: 'program_lesson' });
	return { id };
};

// Chương trình đào tạo đang gắn với 1 bài học (danh sách id) — nguồn khởi tạo
// cho multi-select ở form sửa.
const getLessonProgramIds = async (lessonId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('lesson_id', sql.VarChar(20), lessonId)
		.query('SELECT program_id FROM lesson_programs WHERE lesson_id = @lesson_id');
	return r.recordset.map((x) => x.program_id);
};

// Gán LẠI TOÀN BỘ danh sách chương trình cho 1 bài học (xoá hết rồi chèn lại,
// display_order = vị trí trong mảng) — dùng cho multi-select ở form sửa
// KHÔNG tự xoá bài học kể cả khi programIds rỗng —
// khác unlinkLesson (gỡ từng cái 1 ở danh sách bài học/chương trình, có dọn
// mồ côi) vì đây là hành động sửa có chủ đích của người dùng trên chính bài
// học, không phải gỡ ngẫu nhiên.
const setLessonPrograms = async (lessonId, programIds, actorId) => {
	const pool = await getPool();
	const ids = [...new Set((programIds || []).filter(Boolean))];
	await pool
		.request()
		.input('lesson_id', sql.VarChar(20), lessonId)
		.query('DELETE FROM lesson_programs WHERE lesson_id = @lesson_id');
	for (let i = 0; i < ids.length; i++) {
		await pool
			.request()
			.input('lesson_id', sql.VarChar(20), lessonId)
			.input('program_id', sql.VarChar(20), ids[i])
			.input('display_order', sql.Int, i)
			.input('actor_id', sql.VarChar(20), actorId).query(`
        IF EXISTS (SELECT 1 FROM training_programs WHERE id = @program_id)
        BEGIN
          DECLARE @new_id VARCHAR(20) = 'LP' + LEFT(REPLACE(NEWID(),'-',''), 18);
          INSERT INTO lesson_programs (id, lesson_id, program_id, display_order, created_by)
          VALUES (@new_id, @lesson_id, @program_id, @display_order, @actor_id);
        END
      `);
	}
	broadcast('update', { entity: 'program_lesson' });
	return getLessonProgramIds(lessonId);
};

// Gắn 1 bài học ĐÃ CÓ (đang thuộc chương trình khác, hoặc chưa gắn đâu) vào
// thêm chương trình này.
const linkLesson = async (programId, lessonId, displayOrder, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('program_id', sql.VarChar(20), programId)
		.input('lesson_id', sql.VarChar(20), lessonId)
		.input('display_order', sql.Int, displayOrder || 0)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(
			`
      IF EXISTS (SELECT 1 FROM lesson_programs WHERE lesson_id = @lesson_id AND program_id = @program_id)
      BEGIN
        THROW 51003, N'Bài học này đã được gắn vào chương trình rồi.', 1;
      END
      DECLARE @new_id VARCHAR(20) = 'LP' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO lesson_programs (id, lesson_id, program_id, display_order, created_by)
      VALUES (@new_id, @lesson_id, @program_id, @display_order, @actor_id);
      SELECT @new_id AS id;
    `,
		)
		.catch((err) => {
			if (err.number === 51003) {
				throw httpError(409, 'Bài học này đã được gắn vào chương trình rồi.');
			}
			throw err;
		});
	broadcast('update', { entity: 'program_lesson' });
	return { id: result.recordset[0].id };
};

// Đính kèm NHIỀU bài học có sẵn cùng lúc (checkbox multi-select ở FE) — bản
// bulk của linkLesson, bỏ qua id đã gắn rồi thay vì throw lỗi 409 như bản đơn
// lẻ, để 1 lượt chọn nhiều không bị hỏng cả loạt vì 1 id trùng.
const linkLessons = async (programId, lessonIds, actorId) => {
	const pool = await getPool();
	const ids = [...new Set((lessonIds || []).filter(Boolean))];
	if (!ids.length) return { linked: 0 };

	const existing = await pool
		.request()
		.input('program_id', sql.VarChar(20), programId)
		.query('SELECT lesson_id FROM lesson_programs WHERE program_id = @program_id');
	const already = new Set(existing.recordset.map((r) => r.lesson_id));

	const maxRow = await pool
		.request()
		.input('program_id', sql.VarChar(20), programId)
		.query(
			'SELECT ISNULL(MAX(display_order), -1) AS max_order FROM lesson_programs WHERE program_id = @program_id',
		);
	let nextOrder = maxRow.recordset[0].max_order + 1;

	let linked = 0;
	for (const lessonId of ids) {
		if (already.has(lessonId)) continue;
		await pool
			.request()
			.input('program_id', sql.VarChar(20), programId)
			.input('lesson_id', sql.VarChar(20), lessonId)
			.input('display_order', sql.Int, nextOrder)
			.input('actor_id', sql.VarChar(20), actorId).query(`
        IF EXISTS (SELECT 1 FROM program_lessons WHERE id = @lesson_id)
        BEGIN
          DECLARE @new_id VARCHAR(20) = 'LP' + LEFT(REPLACE(NEWID(),'-',''), 18);
          INSERT INTO lesson_programs (id, lesson_id, program_id, display_order, created_by)
          VALUES (@new_id, @lesson_id, @program_id, @display_order, @actor_id);
        END
      `);
		nextOrder += 1;
		linked += 1;
	}
	broadcast('update', { entity: 'program_lesson' });
	return { linked };
};

// Sắp xếp lại thứ tự TOÀN BỘ bài học của 1 chương trình theo mảng link_id đã
// kéo-thả xong ở FE — display_order = vị trí trong mảng.
const reorderLessons = async (programId, linkIds, actorId) => {
	const pool = await getPool();
	const ids = [...new Set((linkIds || []).filter(Boolean))];
	for (let i = 0; i < ids.length; i++) {
		await pool
			.request()
			.input('id', sql.VarChar(20), ids[i])
			.input('program_id', sql.VarChar(20), programId)
			.input('display_order', sql.Int, i)
			.input('actor_id', sql.VarChar(20), actorId)
			.query(
				'UPDATE lesson_programs SET display_order = @display_order, updated_at = GETDATE(), updated_by = @actor_id WHERE id = @id AND program_id = @program_id',
			);
	}
	broadcast('update', { entity: 'program_lesson' });
	return listLessons(programId);
};

// Đổi thứ tự hiển thị CỦA 1 LƯỢT GẮN (không ảnh hưởng chương trình khác đang
// dùng chung bài học).
const updateLessonLink = async (linkId, data, actorId) => {
	if (data.display_order === undefined) return;
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), linkId)
		.input('display_order', sql.Int, data.display_order)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(
			'UPDATE lesson_programs SET display_order = @display_order, updated_at = GETDATE(), updated_by = @actor_id WHERE id = @id',
		);
	broadcast('update', { entity: 'program_lesson' });
};

// Gỡ bài học khỏi 1 chương trình (không đụng tới chương trình khác đang dùng
// chung). Bài học mồ côi (không còn gắn vào chương trình nào) vẫn được giữ
// lại — có màn hình "Bài học" độc lập (ngoài phạm vi 1 chương trình) để tìm
// lại/gắn tiếp hoặc xoá hẳn thủ công, nên không cần tự dọn ở đây nữa.
const unlinkLesson = async (linkId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), linkId)
		.query('DELETE FROM lesson_programs WHERE id = @id');
	broadcast('update', { entity: 'program_lesson' });
};

// Sửa nội dung DÙNG CHUNG (title/description) — ảnh hưởng mọi chương trình
// đang gắn bài học này.
const updateLesson = async (lessonId, data, actorId) => {
	assertLessonInput(data);
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool
		.request()
		.input('id', sql.VarChar(20), lessonId)
		.input('actor_id', sql.VarChar(20), actorId);

	for (const [field, type] of Object.entries(LESSON_FIELDS)) {
		if (data[field] !== undefined) {
			sets.push(`${field} = @${field}`);
			req.input(field, type, data[field] === '' ? null : data[field]);
		}
	}
	for (const flag of ['is_active', 'allow_split']) {
		if (data[flag] === undefined) continue;
		sets.push(`${flag} = @${flag}`);
		req.input(flag, sql.Bit, data[flag] === false || data[flag] === 'false' ? 0 : 1);
	}
	if (sets.length > 2)
		await req.query(`UPDATE program_lessons SET ${sets.join(', ')} WHERE id = @id`);
	if (Array.isArray(data.department_ids)) await setLessonDepartments(lessonId, data.department_ids);
	broadcast('update', { entity: 'program_lesson' });
};

// Xoá HẲN bài học (cascade xoá mọi lượt gắn ở mọi chương trình + tài liệu của
// nó) — dùng khi unlinkLesson phát hiện không còn chương trình nào dùng nữa,
// hoặc gọi trực tiếp để dọn dẹp cưỡng bức.
const removeLesson = async (lessonId, actorId) => {
	const pool = await getPool();
	const docs = await pool
		.request()
		.input('lesson_id', sql.VarChar(20), lessonId)
		.query('SELECT file_id FROM lesson_documents WHERE lesson_id = @lesson_id');
	// Bài học thay cho "môn học" cũ: các cột subject_id trỏ tới bài học (FK không cascade) → gỡ trước khi xoá
	await pool.request().input('id', sql.VarChar(20), lessonId).query(`
    UPDATE lecturer_assignments SET subject_id = NULL WHERE subject_id = @id;
    UPDATE class_sessions SET subject_id = NULL WHERE subject_id = @id;
    UPDATE question_bank SET subject_id = NULL WHERE subject_id = @id;
    UPDATE exam_papers SET subject_id = NULL WHERE subject_id = @id;
    DELETE FROM grades WHERE subject_id = @id;
    DELETE FROM program_lessons WHERE id = @id;
  `);
	for (const d of docs.recordset) {
		if (d.file_id) await trainingFileService.softDelete(d.file_id, actorId);
	}
	broadcast('update', { entity: 'program_lesson' });
};

// ─── Tài liệu riêng của bài học (lesson_documents) ──────────────────────────
// Mirror course_documents (courseDocumentService.js) nhưng không có doc_type/exam_type
// — bài học chỉ có tài liệu, không có khái niệm bài kiểm tra.
const listLessonDocuments = async (lessonId) => {
	const pool = await getPool();
	const r = await pool.request().input('lesson_id', sql.VarChar(20), lessonId).query(`
    SELECT d.id, d.title, d.is_public, d.download_count, d.created_at,
           d.source_type, d.external_url,
           f.file_name, f.file_url, f.mime_type, f.file_size
    FROM lesson_documents d
    LEFT JOIN training_files f ON f.id = d.file_id AND f.is_deleted = 0
    WHERE d.lesson_id = @lesson_id
    ORDER BY d.created_at DESC
  `);
	return r.recordset;
};

const addLessonDocument = async (lessonId, data, file, actorId) => {
	const pool = await getPool();
	const sourceType = data.source_type === 'link' ? 'link' : 'file';
	let fileId = null;
	if (sourceType === 'file') {
		const savedFile = await trainingFileService.saveUploadedFile(
			'lesson_document',
			lessonId,
			file,
			actorId,
		);
		fileId = savedFile.id;
	}
	const result = await pool
		.request()
		.input('lesson_id', sql.VarChar(20), lessonId)
		.input(
			'title',
			sql.NVarChar(255),
			data.title || (file ? trainingFileService.decodeOriginalName(file.originalname) : 'Liên kết'),
		)
		.input('source_type', sql.VarChar(10), sourceType)
		.input('file_id', sql.VarChar(20), fileId)
		.input(
			'external_url',
			sql.NVarChar(500),
			sourceType === 'link' ? assertHttpUrl(data.external_url, 'Liên kết') : null,
		)
		.input('is_public', sql.Bit, data.is_public === 'false' || data.is_public === false ? 0 : 1)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      DECLARE @new_id VARCHAR(20) = 'TB' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO lesson_documents (id, lesson_id, title, source_type, file_id, external_url, is_public, created_by)
      VALUES (@new_id, @lesson_id, @title, @source_type, @file_id, @external_url, @is_public, @actor_id);
      SELECT @new_id AS id;
    `);
	broadcast('update', { entity: 'lesson_document' });
	return { id: result.recordset[0].id };
};

const removeLessonDocument = async (docId, actorId) => {
	const pool = await getPool();
	const doc = await pool
		.request()
		.input('id', sql.VarChar(20), docId)
		.query('SELECT file_id FROM lesson_documents WHERE id = @id');
	if (!doc.recordset[0]) return;
	await pool
		.request()
		.input('id', sql.VarChar(20), docId)
		.query('DELETE FROM lesson_documents WHERE id = @id');
	if (doc.recordset[0].file_id)
		await trainingFileService.softDelete(doc.recordset[0].file_id, actorId);
	broadcast('update', { entity: 'lesson_document' });
};

const incrementLessonDocumentDownload = async (docId) => {
	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(20), docId).query(`
    UPDATE lesson_documents SET download_count = download_count + 1 WHERE id = @id;
    SELECT download_count FROM lesson_documents WHERE id = @id;
  `);
	if (!result.recordset[0]) {
		throw httpError(404, 'Không tìm thấy tài liệu.');
	}
	return { download_count: result.recordset[0].download_count };
};

// ─── Kết quả học tập theo chương trình ──────────────────────────────────────
// View tổng hợp chỉ-đọc: điểm (grades) đã chấm ở màn Khóa học nhưng gom theo
// chương trình đào tạo — 1 chương trình có thể được nhiều khóa học áp dụng
// (course_programs), mỗi khóa lại có học viên/điểm riêng (grades.program_id,
// xem 2026-09-17_grades_program). Sửa điểm vẫn thực hiện ở courseService, đây
// chỉ đọc lại theo góc nhìn chương trình.
const listProgramResults = async (programId) => {
	const pool = await getPool();
	const r = await pool.request().input('program_id', sql.VarChar(20), programId).query(`
    SELECT g.id, t.id AS trainee_id, t.full_name AS trainee_name,
           c.id AS course_id, c.name AS course_name,
           g.regular_score, g.midterm_score, g.final_score, g.score, g.classification, g.result, g.note
    FROM grades g
    JOIN course_enrollments e ON e.id = g.enrollment_id
    JOIN trainees t ON t.id = e.trainee_id
    JOIN courses c ON c.id = e.course_id
    WHERE g.program_id = @program_id
    ORDER BY c.start_date DESC, t.full_name ASC
  `);
	return r.recordset;
};

module.exports = {
	getAll,
	getById,
	create,
	update,
	remove,
	listLessons,
	listAllLessons,
	createLesson,
	getLessonProgramIds,
	setLessonPrograms,
	setLessonDepartments,
	linkLesson,
	linkLessons,
	reorderLessons,
	updateLessonLink,
	unlinkLesson,
	updateLesson,
	removeLesson,
	listLessonDocuments,
	addLessonDocument,
	removeLessonDocument,
	incrementLessonDocumentDownload,
	listProgramResults,
};
