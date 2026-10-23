const { APPLIES_SQL } = require('./programClassService');

/**
 * Buổi học `s` (class_sessions) có thuộc chương trình mà lượt ghi danh `e`
 * (course_enrollments) đang theo học không — điều kiện dùng chung cho danh sách
 * điểm danh, tự quét QR, lịch học của học viên, chuyên cần ở hồ sơ / bảng điểm /
 * báo cáo. Khóa nhiều chương trình (ĐTLT / CTCV: mỗi chương trình 1 lớp) thì học
 * viên chỉ được điểm danh buổi của lớp mình:
 *   - buổi không gắn bài, hoặc bài không thuộc chương trình nào của khóa ⇒ buổi chung;
 *   - ghi danh chưa chọn chương trình (khóa cũ / 1 chương trình) ⇒ mọi buổi;
 *   - còn lại: bài của buổi phải thuộc chương trình đã ghi danh.
 * Ngoài ra lớp của học viên phải đã mở (khóa áp dụng quy tắc lớp) — lớp chưa mở
 * thì chưa học, kể cả khi bài dùng chung với 1 lớp khác đã mở.
 */
const SESSION_IN_PROGRAM_SQL = (s, e) => `(
  (${s}.subject_id IS NULL OR ${e}.program_id IS NULL
   OR EXISTS (SELECT 1 FROM lesson_programs lp_s
              WHERE lp_s.lesson_id = ${s}.subject_id AND lp_s.program_id = ${e}.program_id)
   OR NOT EXISTS (SELECT 1 FROM lesson_programs lp_s
                  JOIN course_programs cp_s ON cp_s.program_id = lp_s.program_id AND cp_s.course_id = ${s}.course_id
                  WHERE lp_s.lesson_id = ${s}.subject_id))
  AND NOT EXISTS (SELECT 1 FROM course_programs cp_o JOIN courses c_o ON c_o.id = cp_o.course_id
                  WHERE cp_o.course_id = ${s}.course_id AND cp_o.program_id = ${e}.program_id
                    AND cp_o.opened_at IS NULL AND ${APPLIES_SQL('c_o')}))`;

module.exports = { SESSION_IN_PROGRAM_SQL };
