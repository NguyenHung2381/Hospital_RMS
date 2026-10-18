-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE   PROCEDURE [dbo].[sp_process_daily_deadlines]
AS
BEGIN
    -- Đã chuyển sang backend/src/jobs/ (xem migration 2026-11-04_retire_scheduled_deadline_procs).
    SET NOCOUNT ON;
    RETURN;
END;
