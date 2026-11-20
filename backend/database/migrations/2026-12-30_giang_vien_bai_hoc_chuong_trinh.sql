/* ============================================================================
 * 2026-12-30_giang_vien_bai_hoc_chuong_trinh
 * ----------------------------------------------------------------------------
 *   Giảng viên giảng dạy từng bài học của 1 chương trình đào tạo (nhập từ Excel
 *   ở tab "Bài học" của chương trình — programLessonLecturerImportService).
 *
 *   program_lesson_lecturers — 1 dòng / (chương trình, bài học, giảng viên).
 *   Khóa theo cặp (program_id, lesson_id) chứ không theo lesson_programs.id:
 *   "Chương trình áp dụng" ở form bài học (setLessonPrograms) xóa hết lượt gắn
 *   rồi chèn lại nên mã lượt gắn đổi, còn cặp chương trình + bài thì giữ nguyên.
 *   Gỡ bài khỏi chương trình thì ứng dụng dọn các dòng của cặp đó
 *   (programLessonService.pruneLessonLecturers).
 *
 *   role: 'main' = giảng viên chính (mỗi bài trong 1 chương trình tối đa 1 —
 *   uq_pll_main) | 'assistant' = giảng viên phụ. Cùng quy ước với
 *   lecturer_assignments (phân công theo khóa học).
 *
 *   Xóa chương trình / bài học / giảng viên thì dòng ở đây xóa theo (CASCADE):
 *   đây là dự kiến giảng dạy của chương trình, không phải lịch sử phân công.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

CREATE TABLE IF NOT EXISTS program_lesson_lecturers (
	program_id varchar(20) NOT NULL,
	lesson_id varchar(20) NOT NULL,
	lecturer_id varchar(20) NOT NULL,
	role varchar(10) DEFAULT 'assistant' NOT NULL,
	created_at timestamp(6) DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh') NOT NULL,
	created_by varchar(20),
	updated_at timestamp(6),
	updated_by varchar(20),
	CONSTRAINT program_lesson_lecturers_pkey PRIMARY KEY (program_id, lesson_id, lecturer_id)
);

ALTER TABLE program_lesson_lecturers DROP CONSTRAINT IF EXISTS chk_pll_role;
ALTER TABLE program_lesson_lecturers ADD CONSTRAINT chk_pll_role CHECK (role IN ('main', 'assistant'));

ALTER TABLE program_lesson_lecturers DROP CONSTRAINT IF EXISTS fk_pll_program;
ALTER TABLE program_lesson_lecturers ADD CONSTRAINT fk_pll_program
	FOREIGN KEY (program_id) REFERENCES training_programs (id) ON DELETE CASCADE;
ALTER TABLE program_lesson_lecturers DROP CONSTRAINT IF EXISTS fk_pll_lesson;
ALTER TABLE program_lesson_lecturers ADD CONSTRAINT fk_pll_lesson
	FOREIGN KEY (lesson_id) REFERENCES program_lessons (id) ON DELETE CASCADE;
ALTER TABLE program_lesson_lecturers DROP CONSTRAINT IF EXISTS fk_pll_lecturer;
ALTER TABLE program_lesson_lecturers ADD CONSTRAINT fk_pll_lecturer
	FOREIGN KEY (lecturer_id) REFERENCES lecturers (id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pll_main ON program_lesson_lecturers (program_id, lesson_id)
	WHERE role = 'main';
CREATE INDEX IF NOT EXISTS ix_pll_lesson ON program_lesson_lecturers (lesson_id);
CREATE INDEX IF NOT EXISTS ix_pll_lecturer ON program_lesson_lecturers (lecturer_id);

COMMENT ON TABLE program_lesson_lecturers IS
	'Giảng viên giảng dạy từng bài học của 1 chương trình đào tạo (chính / phụ)';
