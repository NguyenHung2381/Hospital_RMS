-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
-- ── Trigger: tự động tạo approval khi topic → submitted ────
CREATE TRIGGER [dbo].[trg_topic_auto_approval]
ON [dbo].[topics]
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor VARCHAR(20) = CAST(SESSION_CONTEXT(N'current_user_id') AS VARCHAR(20));

    DECLARE @tmp TABLE (topic_id VARCHAR(15), created_by VARCHAR(20));

    INSERT INTO @tmp
    SELECT i.id, i.created_by
    FROM inserted i
    WHERE i.status = 'submitted'
      AND NOT EXISTS (SELECT 1 FROM approvals a WHERE a.topic_id = i.id);

    INSERT INTO approvals (id, topic_id, status, created_by)
    SELECT 'PD' + t.topic_id, t.topic_id, 'pending',
           ISNULL(@actor, t.created_by)
    FROM @tmp t;
END;
