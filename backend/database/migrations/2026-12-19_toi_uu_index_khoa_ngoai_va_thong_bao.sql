/* ============================================================================
 * 2026-12-19_toi_uu_index_khoa_ngoai_va_thong_bao
 * ----------------------------------------------------------------------------
 *   Rà soát hiệu năng 2026-11 (pg_stat_user_tables + đọc code):
 *
 *   1. Khoá ngoại chưa có index ở các bảng sẽ lớn dần. Thiếu index thì mỗi lần
 *      xoá / đổi khoá ở bảng cha, PG quét toàn bộ bảng con để kiểm tra FK, và
 *      các câu lọc theo cột đó cũng quét toàn bảng. Đường đi cụ thể:
 *        - Xoá bài học (programLessonService.remove): DELETE grades / UPDATE
 *          class_sessions, exam_papers, lecturer_assignments WHERE subject_id = @id,
 *          rồi DELETE program_lessons kiểm tra FK trên chính các bảng đó.
 *        - Gộp hồ sơ (personMergeService): UPDATE persons ... WHERE merged_into_id = @l.
 *        - Xoá ca trực (shiftService): EXISTS shift_assignments WHERE shift_id = @id.
 *        - Lọc CME theo nhóm (cmeRecordService.getAll): r.category_id = @category_id.
 *      Partial index (WHERE cột IS NOT NULL) cho cột phần lớn NULL: nhỏ, ghi nhanh,
 *      vẫn dùng được cho `cột = @x` và cho kiểm tra FK.
 *
 *   2. Danh sách thông báo của 1 người (notificationService.getForUser): WHERE
 *      user_id ORDER BY created_at DESC LIMIT — chưa có index (user_id, created_at)
 *      nên PG đọc mọi thông báo của người đó rồi sắp xếp. Index mới đọc thẳng đúng
 *      1 trang. ix_notif_user_read (user_id, is_read) trở nên thừa (đếm chưa đọc
 *      dùng ix_notif_unread) — giữ lại, bỏ ở bản phát hành sau theo quy ước.
 *
 * Chạy trong 1 transaction. Idempotent: CREATE INDEX IF NOT EXISTS.
 * ==========================================================================*/

-- 1. Khoá ngoại trỏ tới bài học (program_lessons.id)
CREATE INDEX IF NOT EXISTS ix_grades_subject ON grades (subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_class_sessions_subject ON class_sessions (subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_exam_papers_subject ON exam_papers (subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_lecass_subject ON lecturer_assignments (subject_id) WHERE subject_id IS NOT NULL;

-- Khoá ngoại khác ở bảng có đường xoá / lọc theo cột
CREATE INDEX IF NOT EXISTS ix_exam_papers_program ON exam_papers (program_id);
CREATE INDEX IF NOT EXISTS ix_exam_paper_graders_lecturer ON exam_paper_graders (lecturer_id);
CREATE INDEX IF NOT EXISTS ix_persons_merged_into ON persons (merged_into_id) WHERE merged_into_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_pmc_person_b ON person_merge_candidates (person_b_id);
CREATE INDEX IF NOT EXISTS ix_pml_candidate ON person_merge_log (candidate_id) WHERE candidate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_shift_assignments_shift ON shift_assignments (shift_id) WHERE shift_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_cme_records_category ON cme_records (category_id);
CREATE INDEX IF NOT EXISTS ix_workflow_tasks_step ON workflow_tasks (step_id);
CREATE INDEX IF NOT EXISTS ix_seminars_organizer_dept ON seminars (organizer_department_id)
	WHERE organizer_department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_seminar_required_depts_dept ON seminar_required_departments (department_id);

-- 2. Danh sách thông báo theo người nhận, mới nhất trước
CREATE INDEX IF NOT EXISTS ix_notif_user_created ON notifications (user_id, created_at DESC);
