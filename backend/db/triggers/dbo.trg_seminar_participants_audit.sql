-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE   TRIGGER dbo.trg_seminar_participants_audit ON dbo.seminar_participants AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor VARCHAR(20) = CAST(SESSION_CONTEXT(N'current_user_id') AS VARCHAR(20));
    UPDATE p SET updated_at = GETDATE(), updated_by = @actor
    FROM dbo.seminar_participants p INNER JOIN inserted i ON p.id = i.id
    WHERE NOT UPDATE(updated_at);
END;
