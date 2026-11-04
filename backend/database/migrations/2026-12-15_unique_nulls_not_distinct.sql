-- 2026-12-15_unique_nulls_not_distinct (chỉ PostgreSQL, không có bản SQL Server)
--
-- UNIQUE của SQL Server coi các NULL là trùng nhau (chỉ cho 1 dòng NULL), PG mặc định coi
-- là khác nhau. 6 khoá UNIQUE không lọc có cột được NULL dưới đây dựng lại với
-- NULLS NOT DISTINCT (PG ≥ 15) cho đúng như SQL Server — cũng là điều kiện để
-- `upsert` (INSERT … ON CONFLICT) bắt được dòng có cột khoá NULL, vd. điểm danh không theo ca
-- (staff_attendance.shift_id NULL). Baseline mới (scripts/pg/gen-baseline.js) đã sinh sẵn.
-- Dữ liệu đang có dòng trùng thì lệnh ADD báo lỗi, cả file rollback. Chạy lại nhiều lần an toàn.

ALTER TABLE council_members DROP CONSTRAINT IF EXISTS uq_cm_council_user;
ALTER TABLE council_members ADD CONSTRAINT uq_cm_council_user UNIQUE NULLS NOT DISTINCT (council_id, user_id);

ALTER TABLE shift_assignments DROP CONSTRAINT IF EXISTS uq_shift_assignments;
ALTER TABLE shift_assignments ADD CONSTRAINT uq_shift_assignments UNIQUE NULLS NOT DISTINCT (user_id, work_date, shift_id);

ALTER TABLE staff_attendance DROP CONSTRAINT IF EXISTS uq_staff_attendance_user_date_shift;
ALTER TABLE staff_attendance ADD CONSTRAINT uq_staff_attendance_user_date_shift UNIQUE NULLS NOT DISTINCT (user_id, work_date, shift_id);

DROP INDEX IF EXISTS uq_enroll_course_trainee_program;
CREATE UNIQUE INDEX uq_enroll_course_trainee_program ON course_enrollments (course_id, trainee_id, program_id) NULLS NOT DISTINCT;

DROP INDEX IF EXISTS uq_epq_paper_code_question;
CREATE UNIQUE INDEX uq_epq_paper_code_question ON exam_paper_questions (paper_id, code_no, question_id) NULLS NOT DISTINCT;

DROP INDEX IF EXISTS uq_lecass_course_subject_lecturer;
CREATE UNIQUE INDEX uq_lecass_course_subject_lecturer ON lecturer_assignments (course_id, subject_id, lecturer_id) NULLS NOT DISTINCT;
