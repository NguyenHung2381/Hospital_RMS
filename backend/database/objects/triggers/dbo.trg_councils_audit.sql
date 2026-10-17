-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE TRIGGER [dbo].[trg_councils_audit]
ON [dbo].[councils]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor VARCHAR(20) = CAST(SESSION_CONTEXT(N'current_user_id') AS VARCHAR(20));

    UPDATE c
    SET updated_at = GETDATE(),
        updated_by = @actor
    FROM councils c
    INNER JOIN inserted i ON c.id = i.id
    INNER JOIN deleted  d ON c.id = d.id
    WHERE
        i.name                                <> d.name                                OR
        ISNULL(i.specialty_group, N'')        <> ISNULL(d.specialty_group, N'')        OR
        ISNULL(i.location, N'')               <> ISNULL(d.location, N'')               OR
        ISNULL(i.defense_date, '19000101')    <> ISNULL(d.defense_date, '19000101')    OR
        i.status                              <> d.status;
END;
