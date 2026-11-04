/* ============================================================================
 * 2026-12-15_unique_nulls_not_distinct
 * ----------------------------------------------------------------------------
 *   SQL Server: KHÔNG đổi gì. UNIQUE của SQL Server vốn coi các NULL là trùng
 *   nhau (chỉ cho 1 dòng NULL), nên 6 khoá dưới đây đã đúng:
 *     council_members.uq_cm_council_user, shift_assignments.uq_shift_assignments,
 *     staff_attendance.uq_staff_attendance_user_date_shift,
 *     course_enrollments.uq_enroll_course_trainee_program,
 *     exam_paper_questions.uq_epq_paper_code_question,
 *     lecturer_assignments.uq_lecass_course_subject_lecturer.
 *
 *   PostgreSQL: bản cùng tên ở database/pg/migrations/ dựng lại các khoá này với
 *   NULLS NOT DISTINCT cho cùng nghĩa (PG mặc định coi các NULL là khác nhau).
 *   File này chỉ để 2 thư mục migration đi cùng nhau.
 *
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/

PRINT N'✅ Migration 2026-12-15_unique_nulls_not_distinct hoàn tất (SQL Server không đổi gì).';
GO
