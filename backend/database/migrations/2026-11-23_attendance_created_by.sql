/* ============================================================================
 * 2026-11-23_attendance_created_by
 * ----------------------------------------------------------------------------
 *   courseAttendanceService.setAttendance ghi attendance.created_by nhưng bảng
 *   chưa có cột này (2026-09-11_training_operations tạo bảng không có) ⇒ điểm
 *   danh tay buổi học lỗi "Invalid column name 'created_by'". Thêm cột.
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
IF COL_LENGTH(N'dbo.attendance', N'created_by') IS NULL
    ALTER TABLE [dbo].[attendance] ADD [created_by] VARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.attendance', N'created_at') IS NULL
    ALTER TABLE [dbo].[attendance] ADD [created_at] DATETIME NOT NULL
        CONSTRAINT DF_attendance_created_at DEFAULT (GETDATE());
GO
PRINT N'✅ Migration 2026-11-23_attendance_created_by hoàn tất.';
GO
