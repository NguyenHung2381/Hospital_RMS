-- 03_toi_uu — tối ưu cho dữ liệu lớn, chạy SAU 02_constraints_indexes (viết tay).
-- Phần PostgreSQL của database/DB_SCALING_PLAN.md mục 4, 6 (giai đoạn 2).
-- Chạy lại an toàn (IF NOT EXISTS).
SET client_min_messages = warning;

------------------------------------------------------------------------------
-- 1. Index cho khoá ngoại nhóm "trung bình" (mục 4.1). Nhóm "cao" đã có từ
--    migration SQL Server 2026-12-13_toi_uu_index_giai_doan_1 và được sinh vào 02.
------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_survey_responses_respondent ON survey_responses (respondent_user_id);
CREATE INDEX IF NOT EXISTS ix_course_enrollments_main_mentor ON course_enrollments (main_mentor_user_id)
	WHERE main_mentor_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_council_members_external_reviewer ON council_members (external_reviewer_id)
	WHERE external_reviewer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_topic_members_department ON topic_members (department_id);
CREATE INDEX IF NOT EXISTS ix_seminars_topic ON seminars (topic_id) WHERE topic_id IS NOT NULL;

-- Nhật ký bảo mật: lọc theo người thực hiện (màn Nhật ký sự kiện bảo mật)
CREATE INDEX IF NOT EXISTS ix_security_events_actor ON security_events (actor_id, created_at DESC);

------------------------------------------------------------------------------
-- 2. Tìm kiếm chứa chuỗi LIKE / ILIKE '%...%' (mục 4.3). gin_trgm_ops dùng được
--    cho cả LIKE và ILIKE, nên vẫn đúng khi code đổi LIKE → ILIKE (giữ hành vi
--    không phân biệt hoa thường của SQL Server). Chưa bật tìm không dấu.
------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_users_full_name_trgm ON users USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_users_username_trgm ON users USING gin (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_persons_full_name_trgm ON persons USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_trainees_full_name_trgm ON trainees USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_lecturers_full_name_trgm ON lecturers USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_topics_title_trgm ON topics USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_seminars_title_trgm ON seminars USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_courses_name_trgm ON courses USING gin (name gin_trgm_ops);

------------------------------------------------------------------------------
-- 3. Partial index cho điều kiện cố định (mục 4.4)
------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_training_files_entity_active ON training_files (entity_type, entity_id)
	WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS ix_users_department_active ON users (department_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS ix_workflow_tasks_pending ON workflow_tasks (assignee_role_id)
	WHERE status = 'pending';

------------------------------------------------------------------------------
-- 4. Autovacuum riêng cho bảng sửa / xoá nhiều (mục 7). Mặc định PG chờ 20%
--    bảng thay đổi mới dọn — quá trễ khi bảng lớn.
------------------------------------------------------------------------------
ALTER TABLE notifications SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE refresh_tokens SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE staff_attendance SET (autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE job_execution_log SET (autovacuum_vacuum_scale_factor = 0.05);

-- Thống kê ngay cho planner (sau khi nạp dữ liệu). Chỉ bảng của ứng dụng:
-- ANALYZE trơn sẽ cảnh báo vì rms_migrate không có quyền trên bảng hệ thống.
DO $$
DECLARE r record;
BEGIN
	FOR r IN SELECT c.relname FROM pg_class c
	         WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND NOT c.relispartition
	LOOP
		EXECUTE format('ANALYZE %I', r.relname);
	END LOOP;
END $$;
