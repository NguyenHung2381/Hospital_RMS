const { getPool, sql } = require('../../../config/db');
const { appErrorCode } = require('../../../utils/dbErrors');
const { broadcast } = require('../../events/eventService');
const trainingFileService = require('../trainingFileService');
const { assertHttpUrl } = require('../../../utils/safeUrl');
const { httpError } = require('../../../utils/httpError');
const { UNITS } = require('../../../utils/trainingDuration');

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
	if (!ids.length) return;
	// 1 câu INSERT cho cả danh sách; khoa không tồn tại thì bỏ qua
	await pool
		.request()
		.input('lesson_id', sql.VarChar(20), lessonId)
		.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids)).query(`
      INSERT INTO lesson_departments (lesson_id, department_id, display_order)
      SELECT @lesson_id, d.id, CAST(j.[key] AS INT)
      FROM OPENJSON(@ids) j JOIN departments d ON d.id = CAST(j.[value] AS VARCHAR(50))
    `);
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
//
// Lấy CẢ bảng nên gộp lesson_departments / lesson_programs 1 lần bằng GROUP BY
// rồi JOIN, thay vì 4 subquery chạy lại cho từng bài học (Query Store: ~6.000
// logical reads/lần với 588 bài, tăng tuyến tính theo số bài).
const listAllLessons = async () => {
	const pool = await getPool();
	const r = await pool.request().query(`
    SELECT pl.*, ldg.department_ids, ldg.department_names, lpg.program_names, lpg.program_ids
    FROM program_lessons pl
    LEFT JOIN (
      SELECT ld.lesson_id,
             STRING_AGG(ld.department_id, ',') WITHIN GROUP (ORDER BY ld.display_order) AS department_ids,
             STRING_AGG(d.name, ', ') WITHIN GROUP (ORDER BY ld.display_order) AS department_names
      FROM lesson_departments ld LEFT JOIN departments d ON d.id = ld.department_id
      GROUP BY ld.lesson_id
    ) ldg ON ldg.lesson_id = pl.id
    LEFT JOIN (
      SELECT lp.lesson_id, STRING_AGG(tp.name, ', ') AS program_names,
             STRING_AGG(lp.program_id, ',') AS program_ids
      FROM lesson_programs lp LEFT JOIN training_programs tp ON tp.id = lp.program_id
      GROUP BY lp.lesson_id
    ) lpg ON lpg.lesson_id = pl.id
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

// Gán LẠI TOÀN BỘ danh sách chương trình cho 1 bài học (xóa hết rồi chèn lại,
// display_order = vị trí trong mảng) — dùng cho multi-select ở form sửa
// KHÔNG tự xóa bài học kể cả khi programIds rỗng —
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
	if (ids.length)
		await pool
			.request()
			.input('lesson_id', sql.VarChar(20), lessonId)
			.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
			.input('actor_id', sql.VarChar(20), actorId).query(`
        INSERT INTO lesson_programs (id, lesson_id, program_id, display_order, created_by)
        SELECT 'LP' + LEFT(REPLACE(NEWID(),'-',''), 18), @lesson_id, tp.id, CAST(j.[key] AS INT), @actor_id
        FROM OPENJSON(@ids) j JOIN training_programs tp ON tp.id = CAST(j.[value] AS VARCHAR(50))
      `);
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
			if (appErrorCode(err) === 51003) {
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
	// 1 câu UPDATE cho cả danh sách (trước đây 1 round-trip / bài học)
	if (ids.length)
		await pool
			.request()
			.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
			.input('program_id', sql.VarChar(20), programId)
			.input('actor_id', sql.VarChar(20), actorId).query(`
        UPDATE lp SET display_order = CAST(j.[key] AS INT), updated_at = GETDATE(), updated_by = @actor_id
        FROM lesson_programs lp JOIN OPENJSON(@ids) j ON CAST(j.[value] AS VARCHAR(50)) = lp.id
        WHERE lp.program_id = @program_id
      `);
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
// lại/gắn tiếp hoặc xóa hẳn thủ công, nên không cần tự dọn ở đây nữa.
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

// Xóa HẲN bài học (cascade xóa mọi lượt gắn ở mọi chương trình + tài liệu của
// nó) — dùng khi unlinkLesson phát hiện không còn chương trình nào dùng nữa,
// hoặc gọi trực tiếp để dọn dẹp cưỡng bức.
const removeLesson = async (lessonId, actorId) => {
	const pool = await getPool();
	const docs = await pool
		.request()
		.input('lesson_id', sql.VarChar(20), lessonId)
		.query('SELECT file_id FROM lesson_documents WHERE lesson_id = @lesson_id');
	// Bài học thay cho "môn học" cũ: các cột subject_id trỏ tới bài học (FK không cascade) → gỡ trước khi xóa
	await pool.request().input('id', sql.VarChar(20), lessonId).query(`
    -- GV đã có dòng phân công cả khóa thì bỏ dòng theo bài (UQ_lecass_course_subject_lecturer)
    DELETE la FROM lecturer_assignments la
    WHERE la.subject_id = @id AND EXISTS (
      SELECT 1 FROM lecturer_assignments o
      WHERE o.course_id = la.course_id AND o.lecturer_id = la.lecturer_id AND o.subject_id IS NULL);
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

module.exports = {
	setLessonDepartments,
	listLessons,
	listAllLessons,
	createLesson,
	getLessonProgramIds,
	setLessonPrograms,
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
};
