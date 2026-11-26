// enrollmentExportService.js — đọc dữ liệu cho xuất danh sách học viên của khóa ra Excel.
const { getPool, sql, boolExpr } = require('../../../config/db');
const { STATUSES } = require('./exports/courseEnrollmentWorkbook');

const DEFAULT_STATUSES = ['approved'];

// Chuẩn hóa tùy chọn xuất (thuần): mode hợp lệ, trạng thái hợp lệ (mặc định đã duyệt), mã chương trình duy nhất.
const normalizeOptions = (body = {}) => {
	const mode = body.mode === 'program' ? 'program' : 'course';
	const asList = (v) => (Array.isArray(v) ? v : []);
	const statuses = [...new Set(asList(body.statuses).map(String))].filter((s) =>
		STATUSES.includes(s),
	);
	const programIds = [...new Set(asList(body.program_ids).map(String).filter(Boolean))];
	return {
		mode,
		statuses: statuses.length ? statuses : DEFAULT_STATUSES,
		programIds,
	};
};

// Lọc theo trạng thái và (nếu có) chương trình. programIds rỗng = tất cả (kể cả học viên chưa xếp chương trình).
const filterRows = (rows, { statuses, programIds }) => {
	const st = new Set(statuses);
	const pg = new Set(programIds);
	return rows.filter(
		(r) => st.has(r.status) && (!pg.size || (r.program_id && pg.has(r.program_id))),
	);
};

// Chương trình của khóa theo thứ tự gắn vào khóa; programIds rỗng = tất cả.
const filterPrograms = (programs, programIds) => {
	if (!programIds.length) return programs;
	const pg = new Set(programIds);
	return programs.filter((p) => pg.has(p.id));
};

const loadPrograms = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT tp.id, tp.code, tp.name
    FROM course_programs cp
    JOIN training_programs tp ON tp.id = cp.program_id
    WHERE cp.course_id = @course_id
    ORDER BY cp.created_at, tp.name`);
	return r.recordset;
};

// Toàn bộ ghi danh của khóa kèm hồ sơ học viên (lọc trạng thái / chương trình làm ở JS).
const loadRows = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT e.id, e.program_id, e.status, e.registered_at,
           t.full_name, t.dob, t.gender, t.national_id, t.phone, t.email,
           t.workplace, t.qualification, d.name AS department_name,
           ${boolExpr('t.staff_user_id IS NOT NULL')} AS is_internal,
           tp.code AS program_code, tp.name AS program_name
    FROM course_enrollments e
    JOIN trainees t ON t.id = e.trainee_id
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN training_programs tp ON tp.id = e.program_id
    WHERE e.course_id = @course_id`);
	return r.recordset.map((x) => ({ ...x, is_internal: !!x.is_internal }));
};

// → { mode, programs, rows } đưa thẳng cho buildCourseEnrollmentWorkbook.
const getExportData = async (courseId, body) => {
	const opts = normalizeOptions(body);
	const [programs, all] = await Promise.all([loadPrograms(courseId), loadRows(courseId)]);
	return {
		mode: opts.mode,
		programs: filterPrograms(programs, opts.programIds),
		rows: filterRows(all, opts),
	};
};

module.exports = { normalizeOptions, filterRows, filterPrograms, getExportData };
