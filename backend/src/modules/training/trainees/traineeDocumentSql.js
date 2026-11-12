// SQL dùng chung cho hồ sơ học viên — file riêng không phụ thuộc service nào để
// traineeService, traineeRecordService và courseEnrollmentService cùng dùng mà không vòng require.
//
// Mỗi học viên chỉ cần nộp 1 file PDF hồ sơ đầy đủ (không còn chia theo loại giấy tờ).
// Trạng thái hồ sơ của học viên t:
//   'done'    — có ít nhất 1 file đã duyệt (cán bộ tải lên = duyệt sẵn)
//   'pending' — chỉ có file học viên tự nộp / nộp kèm khi đăng ký, chờ duyệt
//   'missing' — chưa có file nào (hoặc toàn bộ bị từ chối)
// File cũ nộp theo từng loại giấy tờ (trước khi gộp) vẫn tính — học viên đã nộp rồi.

const docExists = (t, status) => `EXISTS (
    SELECT 1 FROM trainee_documents sd JOIN training_files sf ON sf.id = sd.file_id AND sf.is_deleted = 'false'
    WHERE sd.trainee_id = ${t}.id AND sd.status = '${status}'
  )`;

const DOC_STATE_SQL = (t) =>
	`CASE WHEN ${docExists(t, 'approved')} THEN 'done' WHEN ${docExists(t, 'pending')} THEN 'pending' ELSE 'missing' END`;

// Lọc danh sách học viên theo trạng thái hồ sơ (?doc_state=done|pending|missing)
const DOC_STATE_WHERE = {
	done: (t) => docExists(t, 'approved'),
	pending: (t) => `NOT ${docExists(t, 'approved')} AND ${docExists(t, 'pending')}`,
	missing: (t) => `NOT ${docExists(t, 'approved')} AND NOT ${docExists(t, 'pending')}`,
};

module.exports = { DOC_STATE_SQL, DOC_STATE_WHERE };
