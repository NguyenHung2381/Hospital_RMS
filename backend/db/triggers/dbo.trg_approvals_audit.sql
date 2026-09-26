-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
-- ── Trigger: approvals ─────────────────────────────────────
CREATE TRIGGER [dbo].[trg_approvals_audit]
ON [dbo].[approvals]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor VARCHAR(20) = CAST(SESSION_CONTEXT(N'current_user_id') AS VARCHAR(20));

    UPDATE a
    SET updated_at = GETDATE(),
        updated_by = @actor
    FROM approvals a
    INNER JOIN inserted i ON a.id = i.id
    INNER JOIN deleted  d ON a.id = d.id
    WHERE
        i.status  <> d.status  OR
        ISNULL(i.comment,N'') <>
        ISNULL(d.comment,N'');
END;
