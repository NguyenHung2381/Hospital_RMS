// SQL dùng chung cho checklist giấy tờ học viên (giai đoạn 3) — file riêng không phụ
// thuộc service nào để traineeService và traineeRecordService cùng dùng mà không vòng require.

// Loại giấy tờ dt bắt buộc với học viên t: t có ghi danh (chưa bị từ chối) vào khóa
// mang loại nằm trong dt.required_for_types (danh sách id cách nhau dấu phẩy).
const DOC_REQUIRED_SQL = (t, dt) => `EXISTS (
    SELECT 1 FROM course_enrollments re JOIN courses rc ON rc.id = re.course_id
    WHERE re.trainee_id = ${t}.id AND re.status <> 'rejected' AND rc.training_type_id IS NOT NULL
      AND ${dt}.required_for_types IS NOT NULL
      AND CHARINDEX(',' + rc.training_type_id + ',', ',' + REPLACE(${dt}.required_for_types, ' ', '') + ',') > 0
  )`;
const DOC_SUBMITTED_SQL = (t, dt) => `EXISTS (
    SELECT 1 FROM trainee_documents sd JOIN training_files sf ON sf.id = sd.file_id AND sf.is_deleted = 0
    WHERE sd.trainee_id = ${t}.id AND sd.doc_type = ${dt}.id AND sd.status = 'approved'
  )`;
// Cột "Hồ sơ x/y" + lọc "thiếu hồ sơ" ở danh sách học viên (traineeService.getAll)
// (SQL Server không cho subquery trong SUM ⇒ đếm qua OUTER APPLY)
const DOC_COUNT_APPLY = `OUTER APPLY (
    SELECT COUNT(*) AS doc_required, COUNT(ok.x) AS doc_done
    FROM trainee_document_types dt
    OUTER APPLY (
      SELECT TOP 1 1 AS x FROM trainee_documents sd
      JOIN training_files sf ON sf.id = sd.file_id AND sf.is_deleted = 0
      WHERE sd.trainee_id = t.id AND sd.doc_type = dt.id AND sd.status = 'approved'
    ) ok
    WHERE ${DOC_REQUIRED_SQL('t', 'dt')}
  ) dc`;
const DOC_MISSING_SQL = `EXISTS (
    SELECT 1 FROM trainee_document_types dt
    WHERE ${DOC_REQUIRED_SQL('t', 'dt')} AND NOT ${DOC_SUBMITTED_SQL('t', 'dt')}
  )`;

module.exports = { DOC_REQUIRED_SQL, DOC_SUBMITTED_SQL, DOC_COUNT_APPLY, DOC_MISSING_SQL };
