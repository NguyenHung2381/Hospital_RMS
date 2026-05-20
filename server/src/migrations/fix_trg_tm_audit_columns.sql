-- Fix: Update trg_tm_audit trigger to use correct column names
-- The columns in topic_members are name, phone_number, position
-- (previously ho_ten, so_dien_thoai, chuc_vu)

ALTER TRIGGER trg_tm_audit
ON topic_members
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor VARCHAR(20) = CAST(SESSION_CONTEXT(N'current_user_id') AS VARCHAR(20));

    UPDATE tm
    SET updated_at = GETDATE(),
        updated_by = @actor
    FROM topic_members tm
    INNER JOIN inserted i ON tm.id = i.id
    INNER JOIN deleted  d ON tm.id = d.id
    WHERE
        i.name                 <> d.name                 OR
        ISNULL(i.email,'')     <> ISNULL(d.email,'')     OR
        ISNULL(i.phone_number,'') <> ISNULL(d.phone_number,'') OR
        ISNULL(i.position,'')  <> ISNULL(d.position,'')  OR
        i.role                 <> d.role                 OR
        ISNULL(i.user_id,'')   <> ISNULL(d.user_id,'')   OR
        i.account_granted      <> d.account_granted;
END;
GO
