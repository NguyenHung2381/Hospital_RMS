/* ============================================================================
 * Bổ sung trainees: trạng thái, trình độ chuyên môn, ghi chú
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu form "Thêm/Sửa học viên" của hệ thống cũ (dm_hoc_vien) với form
 *   hiện tại: còn thiếu 3 trường — trang_thai (Hoạt động/Ngừng), trinh_do_chuyen_mon
 *   (Trình độ chuyên môn, vd "Cử nhân điều dưỡng"), ghi_chu (Ghi chú tự do).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.trainees', 'is_active') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [is_active] BIT NOT NULL
        CONSTRAINT DF_trainees_is_active DEFAULT (1);
GO
IF COL_LENGTH('dbo.trainees', 'qualification') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [qualification] NVARCHAR(150) NULL; -- trinh_do_chuyen_mon
GO
IF COL_LENGTH('dbo.trainees', 'notes') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [notes] NVARCHAR(MAX) NULL; -- ghi_chu
GO

PRINT N'✅ Migration 2026-09-14_trainee_status_notes hoàn tất.';
GO
