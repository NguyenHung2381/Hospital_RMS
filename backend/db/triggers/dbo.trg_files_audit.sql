-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
-- ── Trigger: files (soft delete / sửa mô tả) ───────────────
CREATE TRIGGER [dbo].[trg_files_audit]
ON [dbo].[files]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor VARCHAR(20) = CAST(SESSION_CONTEXT(N'current_user_id') AS VARCHAR(20));

    UPDATE f
    SET updated_at = GETDATE(),
        updated_by = @actor
    FROM files f
    INNER JOIN inserted i ON f.id = i.id
    INNER JOIN deleted  d ON f.id = d.id
    WHERE
        i.is_deleted  <> d.is_deleted  OR
        ISNULL(i.description,N'') <>
        ISNULL(d.description,N'') OR
        i.file_name   <> d.file_name;
END;
