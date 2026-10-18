const { getPool, sql } = require('../../../config/db');

// Truy cập dữ liệu chứng chỉ khóa học — CHỈ SQL, không quy tắc nghiệp vụ,
// không ném lỗi HTTP, không phát sự kiện (việc của certificateService.js).
// Mẫu repository cho các module khác: mỗi hàm 1 câu lệnh/1 việc, trả dữ liệu
// thuần (mảng, object, số, null).

const listByCourse = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT c.*, t.full_name AS trainee_name, f.file_name, f.file_url
    FROM certificates c
    JOIN course_enrollments e ON e.id = c.enrollment_id
    JOIN trainees t ON t.id = e.trainee_id
    LEFT JOIN training_files f ON f.id = c.file_id AND f.is_deleted = 0
    WHERE e.course_id = @course_id
    ORDER BY c.issue_date DESC
  `);
	return r.recordset;
};

// Trạng thái đăng ký khóa học; null nếu không có đăng ký này.
const findEnrollmentStatus = async (enrollmentId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.query('SELECT status FROM course_enrollments WHERE id = @id');
	return r.recordset[0]?.status ?? null;
};

// Cấp chứng chỉ: số CC<năm><4 số> (sp_gen_certificate_no) + mã (sp_gen_certificate_id).
// Trả { id, cert_no }; null nếu đăng ký này đã có chứng chỉ (kiểm tra trong
// cùng câu lệnh với INSERT — không có khe giữa kiểm tra và ghi).
const DUPLICATE = 51001;
const insert = async ({ enrollmentId, actorId, year, expiryDate }) => {
	const pool = await getPool();
	try {
		const r = await pool
			.request()
			.input('actor_id', sql.VarChar(20), actorId)
			.input('enrollment_id', sql.VarChar(20), enrollmentId)
			.input('year', sql.VarChar(4), String(year))
			.input('expiry_date', sql.Date, expiryDate || null).query(`
      IF EXISTS (SELECT 1 FROM certificates WHERE enrollment_id = @enrollment_id)
      BEGIN
        THROW ${DUPLICATE}, N'Học viên này đã được cấp chứng chỉ cho khóa học này rồi.', 1;
      END
      DECLARE @cert_no VARCHAR(30);
      EXEC sp_gen_certificate_no @year = @year, @actor_id = @actor_id, @new_no = @cert_no OUTPUT;
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_certificate_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      INSERT INTO certificates (id, enrollment_id, cert_no, expiry_date, created_by)
      VALUES (@new_id, @enrollment_id, @cert_no, @expiry_date, @actor_id);
      SELECT @new_id AS id, @cert_no AS cert_no;
    `);
		return r.recordset[0];
	} catch (err) {
		if (err.number === DUPLICATE) return null;
		throw err;
	}
};

const deleteById = async (certId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), certId)
		.query('DELETE FROM certificates WHERE id = @id');
};

// Thu hồi mềm; trả số dòng đổi (0 = không có hoặc đã thu hồi trước đó).
const revoke = async ({ certId, reason, actorId }) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), certId)
		.input('reason', sql.NVarChar(255), reason || null)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      UPDATE certificates
      SET status = 'revoked', revoked_at = GETDATE(), revoked_by = @actor_id, revoke_reason = @reason,
          updated_at = GETDATE(), updated_by = @actor_id
      WHERE id = @id AND status <> 'revoked';
      SELECT @@ROWCOUNT AS affected;
    `);
	return r.recordset[0]?.affected ?? 0;
};

module.exports = { listByCourse, findEnrollmentStatus, insert, deleteById, revoke };
