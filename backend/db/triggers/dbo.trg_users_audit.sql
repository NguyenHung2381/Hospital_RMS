-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
------------------------------------------------------------------------------
-- 4. Vá các đối tượng DB đang tham chiếu account_type
------------------------------------------------------------------------------

-- 4a. Trigger audit: bỏ dòng so sánh account_type
CREATE   TRIGGER [dbo].[trg_users_audit]
ON [dbo].[users]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor VARCHAR(20) = CAST(SESSION_CONTEXT(N'current_user_id') AS VARCHAR(20));

    UPDATE u
    SET updated_at = GETDATE(),
        updated_by = @actor
    FROM users u
    INNER JOIN inserted i ON u.id = i.id
    INNER JOIN deleted  d ON u.id = d.id
    WHERE
        i.username      <> d.username      OR
        i.password      <> d.password      OR
        i.full_name     <> d.full_name     OR
        ISNULL(i.email,'')           <> ISNULL(d.email,'')           OR
        ISNULL(i.department_id,'')   <> ISNULL(d.department_id,'')   OR
        ISNULL(i.role_id,'')         <> ISNULL(d.role_id,'')         OR
        i.is_active     <> d.is_active     OR
        ISNULL(i.topic_member_id,'') <> ISNULL(d.topic_member_id,'');
END;
