-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
/* ============================================================
   PHẦN 6: CLEANUP NOTIFICATIONS THEO BATCH (chạy định kỳ)
   Xóa theo lô nhỏ tránh lock escalation khi bảng lớn.
   Express không có SQL Agent → chạy qua Task Scheduler:
   sqlcmd -S .\SQLEXPRESS -d RMS_HOSPITAL -Q "EXEC sp_cleanup_old_notifications"
   ============================================================ */
CREATE   PROCEDURE [dbo].[sp_cleanup_old_notifications]
    @retain_days INT = 90,
    @batch_size  INT = 2000
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @cutoff DATETIME2 = DATEADD(DAY, -@retain_days, SYSDATETIME());
    DECLARE @deleted INT = 1;

    WHILE @deleted > 0
    BEGIN
        DELETE TOP (@batch_size) FROM dbo.notifications
        WHERE is_read = 1 AND created_at < @cutoff;
        SET @deleted = @@ROWCOUNT;
        -- nghỉ ngắn giữa các lô để không chiếm hết IO
        IF @deleted > 0 WAITFOR DELAY '00:00:01';
    END
END;
