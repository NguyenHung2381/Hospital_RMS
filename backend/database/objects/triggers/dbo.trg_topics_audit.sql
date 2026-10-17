-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
-- ── Trigger: topics ────────────────────────────────────────
CREATE TRIGGER [dbo].[trg_topics_audit]
ON [dbo].[topics]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor VARCHAR(20) = CAST(SESSION_CONTEXT(N'current_user_id') AS VARCHAR(20));

    UPDATE t
    SET updated_at = GETDATE(),
        updated_by = @actor
    FROM topics t
    INNER JOIN inserted i ON t.id = i.id
    INNER JOIN deleted  d ON t.id = d.id
    WHERE
        i.title                    <> d.title                    OR
        ISNULL(i.description,N'')  <> ISNULL(d.description,N'') OR
        i.round_id                 <> d.round_id                 OR
        ISNULL(i.category_id,'')   <> ISNULL(d.category_id,'')  OR
        ISNULL(i.level_id,'')      <> ISNULL(d.level_id,'')     OR
        ISNULL(i.department_id,'') <> ISNULL(d.department_id,'')OR
        i.status                   <> d.status;
END;
