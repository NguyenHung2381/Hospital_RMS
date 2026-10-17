-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE TRIGGER [dbo].[trg_research_rounds_audit]
ON [dbo].[research_rounds]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor VARCHAR(20) = CAST(SESSION_CONTEXT(N'current_user_id') AS VARCHAR(20));
    UPDATE rr
    SET    updated_at = GETDATE(),
           updated_by = @actor
    FROM   [dbo].[research_rounds] rr
    INNER JOIN inserted i ON rr.id = i.id
    INNER JOIN deleted  d ON rr.id = d.id
    WHERE  i.name         <> d.name
       OR  i.year         <> d.year
       OR  i.round_number <> d.round_number  -- đã đổi từ dot_so
       OR  i.status       <> d.status
       OR  i.start_date   <> d.start_date
       OR  i.end_date     <> d.end_date;
END;
