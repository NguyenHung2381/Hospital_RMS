const { getPool, sql, withTransaction, nowSql } = require('../../../config/db');
const { genCertificateId, genCertificateNo } = require('../../../utils/idGenerator');
const { constraintName } = require('../../../utils/dbErrors');

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
    LEFT JOIN training_files f ON f.id = c.file_id AND f.is_deleted = 'false'
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

// Cấp chứng chỉ: số CC<năm><4 số> (genCertificateNo) + mã (genCertificateId).
// Trả { id, cert_no, course_id }; null nếu đăng ký này đã có chứng chỉ. Kiểm tra nằm trong
// chính câu INSERT (… WHERE NOT EXISTS); 2 request cùng lúc thì UNIQUE uq_cert_enrollment chặn.
const insert = async ({ enrollmentId, actorId, year, expiryDate }) => {
	try {
		return await withTransaction(async (tx) => {
			const certNo = await genCertificateNo(tx, year ? Number(year) : undefined);
			const newId = await genCertificateId(tx);
			const ins = await tx
				.request()
				.input('cert_no', sql.VarChar(30), certNo)
				.input('new_id', sql.VarChar(20), newId)
				.input('actor_id', sql.VarChar(20), actorId)
				.input('enrollment_id', sql.VarChar(20), enrollmentId)
				.input('expiry_date', sql.Date, expiryDate || null).query(`
      INSERT INTO certificates (id, enrollment_id, cert_no, expiry_date, created_by)
      -- CAST: tham số dùng cả ở đây lẫn WHERE — PG cần cùng 1 kiểu (không CAST thì text ≠ varchar)
      SELECT @new_id, CAST(@enrollment_id AS VARCHAR(20)), @cert_no, @expiry_date, @actor_id
      WHERE NOT EXISTS (SELECT 1 FROM certificates WHERE enrollment_id = @enrollment_id)`);
			if (!ins.rowsAffected[0]) return null;
			const course = await tx
				.request()
				.input('enrollment_id', sql.VarChar(20), enrollmentId)
				.query('SELECT course_id FROM course_enrollments WHERE id = @enrollment_id');
			return { id: newId, cert_no: certNo, course_id: course.recordset[0]?.course_id ?? null };
		});
	} catch (err) {
		if (constraintName(err) === 'uq_cert_enrollment') return null;
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
      SET status = 'revoked', revoked_at = ${nowSql}, revoked_by = @actor_id, revoke_reason = @reason,
          updated_at = ${nowSql}, updated_by = @actor_id
      WHERE id = @id AND status <> 'revoked'
    `);
	return r.rowsAffected[0] ?? 0;
};

module.exports = { listByCourse, findEnrollmentStatus, insert, deleteById, revoke };
