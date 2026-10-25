/* ============================================================================
 * 2026-12-08_cot_created_by_con_thieu
 * ----------------------------------------------------------------------------
 *   Quy ước (database/README.md mục 7): mọi bảng nghiệp vụ có cột audit
 *   created_by. Nhiều bảng tạo trước đây thiếu cột này trong khi code vẫn ghi
 *   "INSERT ... created_by" ⇒ lỗi "Invalid column name 'created_by'" (phát hiện
 *   bằng test-integration/insertColumns.test.js), ví dụ:
 *     exam_paper_questions / exam_attempts  tạo đề có câu hỏi, bắt đầu làm bài
 *     survey_questions / survey_responses   tạo khảo sát, nộp phiếu khảo sát
 *     workflow_instances / _steps / _tasks  luồng duyệt đề tài
 *     council_progress_reviews / council_topic_results, person_merge_candidates
 *   Giống 2026-11-28_audit_updated_columns: quét mọi bảng dbo, thêm cột còn
 *   thiếu (NULL — dòng cũ không rõ người tạo). Bỏ qua dbo.schema_migrations.
 * Idempotent — mỗi bảng kiểm tra COL_LENGTH trước khi thêm. Chỉ THÊM cột.
 * ==========================================================================*/

DECLARE @tbl SYSNAME, @sql NVARCHAR(MAX);
DECLARE tables CURSOR LOCAL FAST_FORWARD FOR
    SELECT t.name FROM sys.tables t
    WHERE t.is_ms_shipped = 0
      AND t.schema_id = SCHEMA_ID(N'dbo')
      AND t.name <> N'schema_migrations'
    ORDER BY t.name;
OPEN tables;
FETCH NEXT FROM tables INTO @tbl;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF COL_LENGTH(N'dbo.' + QUOTENAME(@tbl), N'created_by') IS NULL
    BEGIN
        SET @sql = N'ALTER TABLE [dbo].' + QUOTENAME(@tbl) + N' ADD [created_by] VARCHAR(20) NULL;';
        EXEC sys.sp_executesql @sql;
        PRINT N'  + ' + @tbl + N'.created_by';
    END
    FETCH NEXT FROM tables INTO @tbl;
END
CLOSE tables;
DEALLOCATE tables;
GO

PRINT N'✅ Migration 2026-12-08_cot_created_by_con_thieu hoàn tất.';
GO
