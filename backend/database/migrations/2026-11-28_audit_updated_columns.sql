/* ============================================================================
 * 2026-11-28_audit_updated_columns
 * ----------------------------------------------------------------------------
 *   Quy ước: MỌI bảng nghiệp vụ đều có cặp cột audit cập nhật
 *     updated_at DATETIME2 NULL     — NULL = chưa sửa lần nào kể từ khi tạo
 *     updated_by VARCHAR(20) NULL   — mã người sửa gần nhất (@actor_id)
 *   Nhiều bảng tạo trước đây thiếu cặp cột này trong khi code vẫn ghi
 *   "updated_by = @actor_id" ⇒ lỗi "Invalid column name 'updated_by'"
 *   (lecturer_assignments, certificates, exam_attempts, workflow_instances,
 *   training_files, lesson_programs, council_members, external_reviewers…).
 *   Quét mọi bảng dbo và thêm cột còn thiếu (kể cả bảng phát sinh sau này nếu
 *   chạy lại tay). Bỏ qua dbo.schema_migrations — bảng của runner migration.
 * Idempotent — mỗi cột kiểm tra COL_LENGTH trước khi thêm.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
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
    IF COL_LENGTH(N'dbo.' + QUOTENAME(@tbl), N'updated_at') IS NULL
    BEGIN
        SET @sql = N'ALTER TABLE [dbo].' + QUOTENAME(@tbl) + N' ADD [updated_at] DATETIME2 NULL;';
        EXEC sys.sp_executesql @sql;
        PRINT N'  + ' + @tbl + N'.updated_at';
    END
    IF COL_LENGTH(N'dbo.' + QUOTENAME(@tbl), N'updated_by') IS NULL
    BEGIN
        SET @sql = N'ALTER TABLE [dbo].' + QUOTENAME(@tbl) + N' ADD [updated_by] VARCHAR(20) NULL;';
        EXEC sys.sp_executesql @sql;
        PRINT N'  + ' + @tbl + N'.updated_by';
    END
    FETCH NEXT FROM tables INTO @tbl;
END
CLOSE tables;
DEALLOCATE tables;
GO
PRINT N'✅ Migration 2026-11-28_audit_updated_columns hoàn tất.';
GO
