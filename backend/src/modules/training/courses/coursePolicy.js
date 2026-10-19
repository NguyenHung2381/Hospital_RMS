const { getPool, sql } = require('../../../config/db');
const { scopeOf } = require('../../../permissions/authz');
const { httpError } = require('../../../utils/httpError');

// EXISTS: khóa có giảng viên = actor được phân công dạy hay không (điều kiện
// dùng chung cho cả getAll và getById khi scope === 'assigned').
const ASSIGNED_EXISTS_SQL = `EXISTS (
    SELECT 1 FROM lecturer_assignments la
    INNER JOIN lecturers lec ON lec.id = la.lecturer_id
    WHERE la.course_id = c.id AND lec.user_id = @actor_id
  )`;

// ─── Kiểm tra theo bản ghi (chống IDOR) ─────────────────────────────────────
// Phạm vi 'assigned' (giảng viên) chỉ thao tác được khoá học mình được phân
// công. authorizePermission ở route không biết khoá học cụ thể — trước đây chỉ
// danh sách + chi tiết khoá học lọc theo phân công, còn học viên / buổi học /
// điểm danh / tài liệu / điểm / chứng chỉ của khoá khác vẫn đọc-sửa được theo
// mã. modules/training/courses/courses.routes.js gắn các hàm dưới qua router.param.
const assertCourseInScope = async (courseId, actor) => {
	if (scopeOf(actor, 'courses') !== 'assigned') return;
	const pool = await getPool();
	const ok = (
		await pool
			.request()
			.input('id', sql.VarChar(20), String(courseId))
			.input('actor_id', sql.VarChar(20), actor.id)
			.query(`SELECT 1 AS ok FROM courses c WHERE c.id = @id AND ${ASSIGNED_EXISTS_SQL}`)
	).recordset[0];
	if (!ok) {
		throw httpError(403, 'Không có quyền thao tác trên khóa học này');
	}
};

// Mã bản ghi con → khoá học chứa nó (tên tham số route → câu truy vấn)
const CHILD_COURSE_SQL = {
	enrollmentId: 'SELECT course_id FROM course_enrollments WHERE id = @id',
	rotationId: `SELECT e.course_id FROM enrollment_rotations r
	             JOIN course_enrollments e ON e.id = r.enrollment_id WHERE r.id = @id`,
	sessionId: 'SELECT course_id FROM class_sessions WHERE id = @id',
	docId: 'SELECT course_id FROM course_documents WHERE id = @id',
	assignmentId: 'SELECT course_id FROM lecturer_assignments WHERE id = @id',
	gradeId: `SELECT e.course_id FROM grades g
	          JOIN course_enrollments e ON e.id = g.enrollment_id WHERE g.id = @id`,
	certId: `SELECT e.course_id FROM certificates c
	         JOIN course_enrollments e ON e.id = c.enrollment_id WHERE c.id = @id`,
};

const assertCourseChildInScope = async (paramName, childId, actor) => {
	if (scopeOf(actor, 'courses') !== 'assigned') return;
	const pool = await getPool();
	const row = (
		await pool
			.request()
			.input('id', sql.VarChar(20), String(childId))
			.query(CHILD_COURSE_SQL[paramName])
	).recordset[0];
	if (!row) throw httpError(404, 'Không tìm thấy dữ liệu');
	await assertCourseInScope(row.course_id, actor);
};

module.exports = {
	ASSIGNED_EXISTS_SQL,
	assertCourseInScope,
	CHILD_COURSE_SQL,
	assertCourseChildInScope,
};
