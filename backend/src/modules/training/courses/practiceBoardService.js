/**
 * practiceBoardService.js — tổng hợp thực hành GPHN theo ngày: ai đang ở khoa
 * nào, mỗi người hướng dẫn (NHD) đang kèm mấy học viên (GĐ4, màn hình theo
 * khoa / theo NHD). Nguồn: enrollment_rotations (vòng đang diễn ra vào ngày đó,
 * chưa bị đánh "không đạt"), hồ sơ không bị từ chối / nghỉ học.
 * Phạm vi 'assigned' (giảng viên) chỉ thấy khóa mình được phân công.
 */
const { getPool, sql } = require('../../../config/db');
const { scopeOf } = require('../../../permissions/authz');
const { httpError } = require('../../../utils/httpError');
const { todayKeyVN } = require('../../../utils/vnDate');
const { ASSIGNED_EXISTS_SQL } = require('./coursePolicy');
const { maxMentorLoad } = require('./enrollmentRotationService');

const NO_DEPARTMENT = 'Chưa chọn khoa';
const NO_MENTOR = 'Chưa phân công NHD';

// Nhóm khóa rỗng (chưa chọn khoa / chưa phân công NHD) xuống cuối
const emptyLast = (a, b) => Number(a.key === '') - Number(b.key === '');
const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'vi');

// Gom các vòng đang diễn ra thành 2 bảng: theo khoa và theo NHD. Khoa/NHD nhận
// diện theo mã; vòng nhập từ sổ cũ chưa khớp được mã thì theo tên bản chụp.
// Mỗi NHD đếm số HỌC VIÊN khác nhau (1 học viên 2 dòng cùng NHD tính 1).
const groupBoard = (rows, maxLoad) => {
	const departments = new Map();
	const mentors = new Map();
	for (const r of rows) {
		const deptKey = r.department_id || (r.department_name ? `name:${r.department_name}` : '');
		if (!departments.has(deptKey))
			departments.set(deptKey, {
				key: deptKey,
				department_id: r.department_id || null,
				name: r.current_department_name || r.department_name || NO_DEPARTMENT,
				rows: [],
			});
		departments.get(deptKey).rows.push(r);

		const mentorKey = r.mentor_user_id || (r.mentor_name ? `name:${r.mentor_name}` : '');
		if (!mentors.has(mentorKey))
			mentors.set(mentorKey, {
				key: mentorKey,
				mentor_user_id: r.mentor_user_id || null,
				name: r.mentor_name || NO_MENTOR,
				rows: [],
				enrollments: new Set(),
			});
		const m = mentors.get(mentorKey);
		m.rows.push(r);
		m.enrollments.add(r.enrollment_id);
	}

	const sortRows = (list) =>
		list.sort((a, b) => String(a.trainee_name).localeCompare(String(b.trainee_name), 'vi'));
	const deptList = [...departments.values()]
		.map((d) => ({
			...d,
			trainee_count: new Set(d.rows.map((r) => r.enrollment_id)).size,
			rows: sortRows(d.rows),
		}))
		.sort((a, b) => emptyLast(a, b) || byName(a, b));
	const mentorList = [...mentors.values()]
		.map(({ enrollments, ...m }) => ({
			...m,
			trainee_count: enrollments.size,
			// Nhóm "chưa phân công" không tính vượt ngưỡng
			over_limit: m.key !== '' && enrollments.size > maxLoad,
			departments: [
				...new Set(m.rows.map((r) => r.current_department_name || r.department_name)),
			].filter(Boolean),
			rows: sortRows(m.rows),
		}))
		.sort((a, b) => emptyLast(a, b) || b.trainee_count - a.trainee_count || byName(a, b));
	return {
		departments: deptList,
		mentors: mentorList,
		summary: {
			trainee_count: new Set(rows.map((r) => r.enrollment_id)).size,
			department_count: deptList.filter((d) => d.key !== '').length,
			mentor_count: mentorList.filter((m) => m.key !== '').length,
			over_limit_count: mentorList.filter((m) => m.over_limit).length,
			unassigned_mentor_count: mentors.get('')?.enrollments.size ?? 0,
		},
	};
};

const getBoard = async (
	{ date = undefined, department_id = undefined, mentor_user_id = undefined } = {},
	actor = null,
) => {
	const day = date ? String(date).slice(0, 10) : todayKeyVN();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw httpError(400, 'Ngày không hợp lệ');
	const pool = await getPool();
	const req = pool.request().input('date', sql.Date, day);
	const where = [];
	if (department_id) {
		where.push('r.department_id = @department_id');
		req.input('department_id', sql.VarChar(20), department_id);
	}
	if (mentor_user_id) {
		where.push('r.mentor_user_id = @mentor_user_id');
		req.input('mentor_user_id', sql.VarChar(20), mentor_user_id);
	}
	if (actor && scopeOf(actor, 'courses') === 'assigned') {
		where.push(ASSIGNED_EXISTS_SQL);
		req.input('actor_id', sql.VarChar(20), actor.id);
	}
	const extra = where.length ? ` AND ${where.join(' AND ')}` : '';
	const [result, maxLoad] = await Promise.all([
		req.query(`
      SELECT r.id, r.enrollment_id, r.round_title, r.seq, r.attempt_no, r.result,
             r.department_id, r.department_name, d.name AS current_department_name,
             r.start_date, r.end_date, r.duration_text,
             r.mentor_user_id, r.mentor_name, r.mentor_license_no,
             e.course_id, c.name AS course_name, e.practice_code, e.progress_status,
             e.trainee_id, t.full_name AS trainee_name,
             e.program_id, tp.code AS program_code, tp.name AS program_name
      FROM enrollment_rotations r
      JOIN course_enrollments e ON e.id = r.enrollment_id
      JOIN courses c ON c.id = e.course_id
      JOIN trainees t ON t.id = e.trainee_id
      LEFT JOIN training_programs tp ON tp.id = e.program_id
      LEFT JOIN departments d ON d.id = r.department_id
      WHERE r.start_date <= @date AND r.end_date >= @date AND r.result <> 'fail'
        AND e.status <> 'rejected' AND e.progress_status <> 'dropped'${extra}
      ORDER BY t.full_name, r.seq
    `),
		maxMentorLoad(),
	]);
	return {
		date: day,
		max_mentor_load: maxLoad,
		...groupBoard(result.recordset, maxLoad),
	};
};

module.exports = { groupBoard, getBoard };
