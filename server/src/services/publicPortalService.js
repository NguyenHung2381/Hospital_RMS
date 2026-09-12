const { getPool, sql } = require('../config/db');
const traineeService = require('./traineeService');
const courseService = require('./courseService');
const trainingRoundService = require('./trainingRoundService');

// ─── Cổng công khai (không đăng nhập) ───────────────────────────────────────
// Chỉ lộ ra tối thiểu dữ liệu cần thiết cho người ngoài hệ thống: danh sách
// khóa học đang mở đăng ký, danh mục đối tượng học viên (cho form), tra cứu
// kết quả theo đúng CCCD người dùng tự nhập, và tạo đăng ký mới. Không có
// endpoint liệt kê/tìm kiếm học viên hàng loạt ở đây.

const getOpenCourses = async () => {
	const pool = await getPool();
	const result = await pool.request().query(`
    SELECT c.id, c.name, c.start_date, c.end_date, c.capacity, c.training_round_id,
           p.name AS program_name, r.name AS training_round_name
    FROM courses c
    LEFT JOIN training_programs p ON p.id = c.program_id
    LEFT JOIN training_rounds r ON r.id = c.training_round_id
    WHERE c.status = 'open'
    ORDER BY c.start_date ASC
  `);

	const rows = [];
	for (const row of result.recordset) {
		const open = await trainingRoundService.isEnrollmentOpen(row.training_round_id);
		if (open) {
			const { training_round_id, ...publicRow } = row;
			void training_round_id;
			rows.push(publicRow);
		}
	}
	return rows;
};

const getTraineeTypes = async () => {
	const pool = await getPool();
	const result = await pool.request().query('SELECT id, name FROM trainee_types ORDER BY name');
	return result.recordset;
};

// Tra cứu kết quả học tập/chứng chỉ theo đúng số CCCD người dùng tự nhập —
// không tìm gần đúng, không liệt kê theo tên, để giảm rủi ro dò quét hàng loạt
// (kết hợp rate-limit chặt ở tầng route).
const lookupResults = async (nationalId) => {
	const pool = await getPool();
	const result = await pool.request().input('national_id', sql.VarChar(20), nationalId).query(`
    SELECT t.full_name, c.name AS course_name, e.status AS enrollment_status,
           g.result, g.score, cert.cert_no, cert.issue_date
    FROM trainees t
    JOIN course_enrollments e ON e.trainee_id = t.id
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN grades g ON g.enrollment_id = e.id AND g.subject_id IS NULL
    LEFT JOIN certificates cert ON cert.enrollment_id = e.id
    WHERE t.national_id = @national_id
    ORDER BY e.registered_at DESC
  `);
	return result.recordset;
};

// Đăng ký khóa học công khai: tự tìm học viên đã có theo CCCD (tránh tạo
// trùng nếu học viên đã từng đăng ký khóa khác), nếu chưa có thì tạo mới với
// actor_id = NULL (không có tài khoản đứng sau thao tác này — cột created_by
// cho phép NULL, giống các trường hợp import/nguồn ngoài khác).
const register = async (data) => {
	const course = await courseService.getById(data.course_id);
	if (!course || course.status !== 'open') {
		const err = new Error('Khóa học không tồn tại hoặc đã đóng đăng ký.');
		err.statusCode = 404;
		throw err;
	}
	if (course.training_round_id) {
		const open = await trainingRoundService.isEnrollmentOpen(course.training_round_id);
		if (!open) {
			const err = new Error('Đợt đào tạo hiện không trong thời gian đăng ký khóa học.');
			err.statusCode = 403;
			throw err;
		}
	}

	let trainee = null;
	if (data.national_id) {
		const pool = await getPool();
		const existing = await pool
			.request()
			.input('national_id', sql.VarChar(20), data.national_id)
			.query('SELECT TOP 1 * FROM trainees WHERE national_id = @national_id ORDER BY created_at DESC');
		trainee = existing.recordset[0] || null;
	}
	if (!trainee) {
		trainee = await traineeService.create(
			{
				full_name: data.full_name,
				dob: data.dob,
				gender: data.gender,
				national_id: data.national_id,
				phone: data.phone,
				email: data.email,
				address: data.address,
				trainee_type_id: data.trainee_type_id,
			},
			null,
		);
	}

	const enrollment = await courseService.registerTrainee(data.course_id, trainee.id, null);
	return { trainee_id: trainee.id, enrollment_id: enrollment.id };
};

module.exports = { getOpenCourses, getTraineeTypes, lookupResults, register };
