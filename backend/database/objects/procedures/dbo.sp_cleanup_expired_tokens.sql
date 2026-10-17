-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
-- Thêm TOP để tránh lock table toàn bộ khi có nhiều token hết hạn
-- Giải pháp micro-batch, tránh deadlock với sp_create_refresh_token
CREATE PROCEDURE [dbo].[sp_cleanup_expired_tokens]
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @deleted INT = 0;
    DECLARE @batch   INT = 1000;  -- xóa 1000 row/lần

    WHILE 1 = 1
    BEGIN
        DELETE TOP (@batch) FROM [dbo].[refresh_tokens]
        WHERE [expires_at] < GETDATE();

        SET @deleted += @@ROWCOUNT;
        IF @@ROWCOUNT < @batch BREAK;
    END;

    SELECT @deleted AS [deleted_count];
END;
