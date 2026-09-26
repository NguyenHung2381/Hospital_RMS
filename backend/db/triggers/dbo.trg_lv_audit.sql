-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE TRIGGER [dbo].[trg_lv_audit] ON [dbo].[levels] AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor VARCHAR(20) = CAST(SESSION_CONTEXT(N'current_user_id') AS VARCHAR(20));
    UPDATE lv SET updated_at = GETDATE(), updated_by = @actor
    FROM levels lv
    INNER JOIN inserted i ON lv.id = i.id
    INNER JOIN deleted  d ON d.id  = i.id
    WHERE i.name <> d.name OR ISNULL(i.description,N'') <> ISNULL(d.description,N'');
END;
