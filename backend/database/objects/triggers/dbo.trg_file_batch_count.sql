-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
-- ── Trigger: cập nhật file_count trong batch ───────────────
CREATE TRIGGER [dbo].[trg_file_batch_count]
ON [dbo].[files]
AFTER INSERT, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE fb
    SET file_count = (SELECT COUNT(*) FROM files f WHERE f.batch_id = fb.id AND f.is_deleted = 0)
    FROM file_batches fb
    WHERE fb.id IN (
        SELECT DISTINCT batch_id FROM inserted
        UNION
        SELECT DISTINCT batch_id FROM deleted
    );
END;
