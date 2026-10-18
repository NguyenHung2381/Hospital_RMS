/* ============================================================================
 * 2026-11-04_retire_scheduled_deadline_procs
 * ----------------------------------------------------------------------------
 *   Việc định kỳ chuyển hết sang job Node (backend/src/jobs/), 2 proc định kỳ
 *   cũ thành no-op — giữ nguyên tên + tham số để SQL Agent job / Task Scheduler
 *   (nếu production còn lập lịch) vẫn chạy thành công nhưng không làm gì:
 *
 *   sp_process_daily_deadlines — trước đây:
 *     A/A2. nhắc deadline cho vai trò 'principal_investigator' (không còn tồn
 *           tại ⇒ không gửi được gì)          → deadlineReminderJob.js
 *     B.    đề tài 'supplement' quá hạn ⇒ tự DUYỆT → nay tự TỪ CHỐI theo quyết
 *           định 18/10/2026                     → supplementDeadlineJob.js
 *     C.    dọn refresh token, khoá TK hết hạn   → accountMaintenanceJob.js
 *           dọn thông báo cũ (gọi sai tên tham số ⇒ luôn lỗi)
 *                                                → notificationCleanupJob.js
 *     Để nguyên thì nếu còn Agent job, bước B sẽ DUYỆT đề tài mà job Node
 *     định TỪ CHỐI — kết quả tuỳ bên nào chạy trước.
 *   sp_remind_deadlines — nhắc theo research_rounds.end_date, trùng với
 *     deadlineReminderJob.js nếu còn được lập lịch.
 *
 * Idempotent (CREATE OR ALTER) — chạy lại an toàn. Bản cũ xem git history
 * của database/objects/procedures/.
 * ==========================================================================*/
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_process_daily_deadlines]
AS
BEGIN
    -- Đã chuyển sang backend/src/jobs/ (xem migration 2026-11-04_retire_scheduled_deadline_procs).
    SET NOCOUNT ON;
    RETURN;
END;
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_remind_deadlines]
    @days_ahead INT = 3
AS
BEGIN
    -- Đã chuyển sang backend/src/jobs/deadlineReminderJob.js (xem migration 2026-11-04_retire_scheduled_deadline_procs).
    SET NOCOUNT ON;
    RETURN;
END;
GO
