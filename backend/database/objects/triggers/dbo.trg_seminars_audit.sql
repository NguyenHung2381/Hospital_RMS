-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
------------------------------------------------------------------------------
-- 4. Trigger audit (updated_at / updated_by) — mẫu trg_cat_audit
------------------------------------------------------------------------------
-- RECURSIVE_TRIGGERS mặc định OFF → trigger tự UPDATE bảng của mình không tái kích hoạt.
CREATE   TRIGGER [dbo].[trg_seminars_audit] ON [dbo].[seminars] AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor VARCHAR(20) = CAST(SESSION_CONTEXT(N'current_user_id') AS VARCHAR(20));
    UPDATE s SET updated_at = GETDATE(), updated_by = @actor
    FROM dbo.seminars s INNER JOIN inserted i ON s.id = i.id
    WHERE NOT UPDATE(updated_at);
END;
