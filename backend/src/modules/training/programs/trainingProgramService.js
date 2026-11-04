// Chương trình đào tạo. Bài học + tài liệu bài học ở programLessonService (export lại ở đây để nơi gọi giữ nguyên).
const {
	getPool,
	sql,
	withActorTransaction,
	actorRequest,
	queryAll,
	nowSql,
	stringAgg,
	jsonArray,
	ilike,
	likeCi,
} = require('../../../config/db');
const { randomId } = require('../../../utils/idGenerator');
const { isUniqueViolation } = require('../../../utils/dbErrors');
const { broadcast } = require('../../events/eventService');
const { paging } = require('../../../utils/paging');
const { httpError } = require('../../../utils/httpError');
const { emptyToNull, withDurationText } = require('./programShared');
const {
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
} = require('./programLessonService');

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
	// GPHN: lĩnh vực chuyên môn / hình thức hành nghề mặc định — tự điền vào hồ sơ thực hành
	professional_field_id: sql.VarChar(20),
	practice_form_id: sql.VarChar(20),
	target_audience: sql.NVarChar(300),
	theory_hours: sql.Int,
	practice_hours: sql.Int,
	// Phần thi cuối khóa: theory | practice | both; NULL = suy theo số tiết (gradebookService)
	exam_parts: sql.VarChar(10),
	credit_hours: sql.Decimal(6, 1),
	tuition_fee: sql.Decimal(18, 0),
	min_capacity: sql.Int,
	max_capacity: sql.Int,
	display_order: sql.Int,
	description: sql.NVarChar(sql.MAX),
};

// Đối tượng học viên: N:N qua program_trainee_types (2026-11-14). trainee_type_name
// = tên các đối tượng nối bằng ", " (chương trình chưa chuyển sang bảng mới thì lấy cột cũ).
const programSelect = `
  SELECT p.*, d.name AS department_name, tp.name AS training_type_name,
         pf.name AS professional_field_name, pfo.name AS practice_form_name,
         (SELECT ${stringAgg('x.trainee_type_id', ',', 'x.display_order')}
            FROM program_trainee_types x WHERE x.program_id = p.id) AS trainee_type_ids,
         COALESCE((SELECT ${stringAgg('t2.name', ', ', 'x.display_order')}
                     FROM program_trainee_types x JOIN trainee_types t2 ON t2.id = x.trainee_type_id
                    WHERE x.program_id = p.id), tt.name) AS trainee_type_name,
         (SELECT COUNT(*) FROM course_programs cp WHERE cp.program_id = p.id) AS course_count,
         (SELECT COUNT(*) FROM lesson_programs lp WHERE lp.program_id = p.id) AS lesson_count,
         -- Vòng thực hành GPHN: mỗi vòng 1 khoa (hoặc nhiều khoa để chọn) + thời lượng riêng.
         ${jsonArray(
						`SELECT lp.id AS link_id, pl.id AS lesson_id, pl.title, pl.duration_value, pl.duration_unit,
                 (SELECT ${stringAgg('ld.department_id', ',', 'ld.display_order')}
                    FROM lesson_departments ld WHERE ld.lesson_id = pl.id) AS department_ids,
                 (SELECT ${stringAgg('d2.name', ' / ', 'ld.display_order')}
                    FROM lesson_departments ld JOIN departments d2 ON d2.id = ld.department_id
                    WHERE ld.lesson_id = pl.id) AS department_names
            FROM lesson_programs lp JOIN program_lessons pl ON pl.id = lp.lesson_id
           WHERE lp.program_id = p.id AND pl.lesson_kind = 'rotation'`,
						'lp.display_order, pl.created_at',
					)} AS rotations
  FROM training_programs p
  LEFT JOIN departments d ON d.id = p.department_id
  LEFT JOIN trainee_types tt ON tt.id = p.trainee_type_id
  LEFT JOIN training_types tp ON tp.id = p.training_type_id
  LEFT JOIN professional_fields pf ON pf.id = p.professional_field_id
  LEFT JOIN practice_forms pfo ON pfo.id = p.practice_form_id
`;

const withRotations = (row) => ({
	...row,
	trainee_type_ids: row.trainee_type_ids
		? row.trainee_type_ids.split(',')
		: row.trainee_type_id
			? [row.trainee_type_id]
			: [],
	rotations: row.rotations ? JSON.parse(row.rotations) : [],
});

// Nhận trainee_type_ids (mảng) hoặc trainee_type_id (client/import cũ) → danh sách
// id; không gửi gì → undefined (giữ nguyên). Cột cũ trainee_type_id = phần tử đầu.
const traineeTypeIdsOf = (data) => {
	if (Array.isArray(data.trainee_type_ids))
		return [...new Set(data.trainee_type_ids.filter(Boolean))];
	if (data.trainee_type_id !== undefined) return data.trainee_type_id ? [data.trainee_type_id] : [];
	return undefined;
};

const withTraineeType = (data, typeIds) =>
	typeIds ? { ...data, trainee_type_id: typeIds[0] ?? null } : data;

// Gán lại toàn bộ đối tượng của 1 chương trình (thứ tự = vị trí trong mảng).
const setProgramTraineeTypes = async (programId, typeIds) => {
	const pool = await getPool();
	await pool
		.request()
		.input('program_id', sql.VarChar(20), programId)
		.query('DELETE FROM program_trainee_types WHERE program_id = @program_id');
	for (let i = 0; i < typeIds.length; i++) {
		await pool
			.request()
			.input('program_id', sql.VarChar(20), programId)
			.input('trainee_type_id', sql.VarChar(20), typeIds[i])
			.input('display_order', sql.Int, i).query(`
        IF EXISTS (SELECT 1 FROM trainee_types WHERE id = @trainee_type_id)
          INSERT INTO program_trainee_types (program_id, trainee_type_id, display_order)
          VALUES (@program_id, @trainee_type_id, @display_order);
      `);
	}
};

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
		where.push(
			`(${ilike('p.name', '@search')} OR ${likeCi('p.code', '@search')} OR ${ilike('p.description', '@search')})`,
		);
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	if (department_id) {
		where.push(`(p.department_id = @department_id OR EXISTS (
        SELECT 1 FROM lesson_programs lp JOIN lesson_departments ld ON ld.lesson_id = lp.lesson_id
        WHERE lp.program_id = p.id AND ld.department_id = @department_id))`);
		req.input('department_id', sql.VarChar(20), department_id);
	}
	if (training_type_id) {
		where.push('p.training_type_id = @training_type_id');
		req.input('training_type_id', sql.VarChar(20), training_type_id);
	}
	const whereSql = `WHERE ${where.join(' AND ')}`;

	const sets = await queryAll(req, [
		`
    ${programSelect} ${whereSql} ORDER BY p.display_order ASC, p.created_at DESC
    ${pg.fetchClause}
		`,
		`
    SELECT COUNT(*) AS total FROM training_programs p ${whereSql}
		`,
	]);
	return {
		data: sets[0].map(withRotations),
		pagination: { page: pg.page, limit: pg.limit, total: sets[1][0].total },
	};
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query(`${programSelect} WHERE p.id = @id`);
	const row = result.recordset[0];
	return row ? withRotations(row) : null;
};

// Vi phạm UQ_trprog_code (mã chương trình trùng) → 409 thay vì 500.
const rethrowDuplicateCode = (err) => {
	if (isUniqueViolation(err)) throw httpError(409, 'Mã chương trình đã tồn tại.');
	throw err;
};

const create = async (data, actorId) => {
	const typeIds = traineeTypeIdsOf(data);
	const input = withDurationText(withTraineeType(data, typeIds));
	const req = actorRequest(actorId).input('actor_id', sql.VarChar(20), actorId);
	const cols = [];
	for (const [field, type] of Object.entries(PROGRAM_FIELDS)) {
		cols.push(field);
		req.input(
			field,
			type,
			field === 'display_order' ? input[field] || 0 : emptyToNull(input[field]),
		);
	}
	const newId = randomId('CT', 18);
	await req
		.input('new_id', sql.VarChar(20), newId)
		.query(
			`
      INSERT INTO training_programs (id, ${cols.join(', ')}, created_by)
      VALUES (@new_id, ${cols.map((c) => `@${c}`).join(', ')}, @actor_id);
    `,
		)
		.catch(rethrowDuplicateCode);
	const id = newId;
	if (typeIds) await setProgramTraineeTypes(id, typeIds);
	broadcast('update', { entity: 'training_program' });
	return getById(id);
};

const update = async (id, data, actorId) => {
	const typeIds = traineeTypeIdsOf(data);
	const input = withDurationText(withTraineeType(data, typeIds));
	const sets = [`updated_at = ${nowSql}`, 'updated_by = @actor_id'];
	const req = actorRequest(actorId)
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
			.query(`UPDATE training_programs SET ${sets.join(', ')} WHERE id = @id`)
			.catch(rethrowDuplicateCode);
	if (typeIds) await setProgramTraineeTypes(id, typeIds);
	broadcast('update', { entity: 'training_program' });
	return getById(id);
};

// Xóa chương trình. Hồ sơ học viên (course_enrollments) và điểm (grades) đã
// chọn chương trình ⇒ chặn (409), vì xóa sẽ làm mất dữ liệu học viên. Các liên
// kết thuần (lesson_programs, course_programs) gỡ luôn — bài học vẫn được giữ
// lại như unlinkLesson. program_subjects / program_trainee_types tự CASCADE.
const remove = async (id, actorId) => {
	const pool = await getPool();
	const usage = await pool.request().input('id', sql.VarChar(20), id).query(`
    SELECT (SELECT COUNT(*) FROM course_enrollments WHERE program_id = @id) AS enrollments,
           (SELECT COUNT(*) FROM grades WHERE program_id = @id) AS grades
  `);
	const { enrollments, grades } = usage.recordset[0];
	if (enrollments || grades) {
		const parts = [];
		if (enrollments) parts.push(`${enrollments} hồ sơ học viên`);
		if (grades) parts.push(`${grades} bản ghi điểm`);
		throw httpError(
			409,
			`Chương trình đang được dùng ở ${parts.join(' và ')} — không xóa được. Hãy đổi chương trình của các hồ sơ đó trước.`,
		);
	}
	await withActorTransaction(actorId, (tx) =>
		tx.request().input('id', sql.VarChar(20), id).input('actor_id', sql.VarChar(20), actorId)
			.query(`
    SET XACT_ABORT ON;
    BEGIN TRAN;
    DELETE FROM lesson_programs WHERE program_id = @id;
    DELETE FROM course_programs WHERE program_id = @id;
    DELETE FROM training_programs WHERE id = @id;
    COMMIT;
  `),
	);
	broadcast('update', { entity: 'training_program' });
	broadcast('update', { entity: 'program_lesson' });
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
