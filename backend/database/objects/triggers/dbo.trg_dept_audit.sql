-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
-- ── Trigger: departments ───────────────────────────────────
CREATE TRIGGER [dbo].[trg_dept_audit]
ON [dbo].[departments]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor VARCHAR(20) = CAST(SESSION_CONTEXT(N'current_user_id') AS VARCHAR(20));

    UPDATE dep
    SET updated_at = GETDATE(),
        updated_by = @actor
    FROM departments dep
    INNER JOIN inserted i ON dep.id = i.id
    INNER JOIN deleted  d ON dep.id = d.id
    WHERE
        i.name    <> d.name    OR
        i.code    <> d.code    OR
        ISNULL(i.parent_id,'')       <> ISNULL(d.parent_id,'')       OR
        ISNULL(i.dept_account_id,'') <> ISNULL(d.dept_account_id,'') OR
        ISNULL(i.description,N'') <>
        ISNULL(d.description,N'');
END;
