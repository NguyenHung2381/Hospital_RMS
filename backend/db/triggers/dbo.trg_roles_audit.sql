-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE TRIGGER [dbo].[trg_roles_audit] ON [dbo].[roles] AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor VARCHAR(20) = CAST(SESSION_CONTEXT(N'current_user_id') AS VARCHAR(20));
    UPDATE r SET updated_at = GETDATE(), updated_by = @actor
    FROM roles r
    INNER JOIN inserted i ON r.id = i.id
    INNER JOIN deleted  d ON d.id = i.id
    WHERE i.name <> d.name OR ISNULL(i.description,N'') <> ISNULL(d.description,N'');
END;
