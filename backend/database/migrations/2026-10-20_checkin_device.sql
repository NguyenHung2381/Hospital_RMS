/* ============================================================================
 * Điểm danh QR: ràng buộc thiết bị
 * ----------------------------------------------------------------------------
 *   attendance.checkin_device_id / seminar_participants.checkin_device_id —
 *   mã thiết bị (FE sinh ngẫu nhiên, lưu localStorage) của lượt tự quét QR.
 *   Service chặn 1 thiết bị điểm danh cho 2 tài khoản khác nhau trong cùng
 *   buổi học / hội thảo (điểm danh hộ bằng tài khoản người khác).
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.attendance', N'checkin_device_id') IS NULL
    ALTER TABLE [dbo].[attendance] ADD [checkin_device_id] VARCHAR(64) NULL;
GO
IF COL_LENGTH(N'dbo.seminar_participants', N'checkin_device_id') IS NULL
    ALTER TABLE [dbo].[seminar_participants] ADD [checkin_device_id] VARCHAR(64) NULL;
GO

PRINT N'✅ Migration 2026-10-20_checkin_device hoàn tất.';
GO
