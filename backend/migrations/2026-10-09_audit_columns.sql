-- Bổ sung 4 cột audit (created_at, created_by, updated_at, updated_by) cho các bảng còn thiếu.
-- Quy ước sẵn có: created_at NOT NULL DEFAULT GETDATE(); created_by/updated_by VARCHAR(20) NULL (không FK);
-- updated_at NULL. Bỏ qua bảng log/token/phiên làm bài (chỉ ghi, không sửa).
-- Dòng cũ: created_at = thời điểm chạy migration (không biết ngày thật), các cột *_by = NULL.
-- Idempotent: chỉ thêm cột chưa có.
SET NOCOUNT ON;
DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql += N'ALTER TABLE [dbo].[' + t.name + N'] ADD [' + c.col + N'] '
    + REPLACE(c.def, N'{T}', t.name) + N';' + CHAR(10)
FROM sys.tables t
CROSS JOIN (VALUES
    (N'created_at', N'DATETIME2 NOT NULL CONSTRAINT [DF_{T}_created_at] DEFAULT GETDATE()'),
    (N'created_by', N'VARCHAR(20) NULL'),
    (N'updated_at', N'DATETIME2 NULL'),
    (N'updated_by', N'VARCHAR(20) NULL')) c(col, def)
WHERE t.is_ms_shipped = 0
  AND t.name NOT IN ('refresh_tokens','security_events','job_execution_log','person_merge_log',
                     'user_backup_codes','notifications','sysdiagrams','exam_answers','survey_answers','deadline_actions')
  AND NOT EXISTS (SELECT 1 FROM sys.columns k WHERE k.object_id = t.object_id AND k.name = c.col);
EXEC sp_executesql @sql;
PRINT N'✅ Migration 2026-10-09_audit_columns hoàn tất.';
GO
