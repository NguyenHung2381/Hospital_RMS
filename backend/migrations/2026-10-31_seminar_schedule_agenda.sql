/* ============================================================================
 * Hội nghị: giờ bắt đầu/kết thúc, khung giờ bài test cuối buổi, chương trình
 * (danh sách bài học / bài báo cáo)
 * ----------------------------------------------------------------------------
 *   seminars.start_time / end_time : giờ bắt đầu (ngày start_date) và giờ kết
 *                              thúc (ngày end_date) — 'HH:mm', VARCHAR(5) như
 *                              class_sessions để tránh lệch múi giờ của kiểu TIME.
 *   seminars.test_date       : ngày làm bài test (trống = ngày kết thúc / bắt đầu)
 *   seminars.test_start_time / test_end_time : khung giờ làm bài test. Khi bài
 *                              test đang bật (test_open = 1) và có khung giờ thì
 *                              chỉ làm được trong khung giờ đó (tự mở / tự đóng).
 *   seminars.agenda          : JSON [{ title, speaker?, date?, start_time?, end_time?, note? }]
 *   Server cũng tự chạy tương đương lúc khởi động (permissions/migrations.js).
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.seminars', N'start_time') IS NULL
    ALTER TABLE [dbo].[seminars] ADD [start_time] VARCHAR(5) NULL, [end_time] VARCHAR(5) NULL;
GO
IF COL_LENGTH(N'dbo.seminars', N'test_date') IS NULL
    ALTER TABLE [dbo].[seminars] ADD [test_date] DATE NULL,
        [test_start_time] VARCHAR(5) NULL, [test_end_time] VARCHAR(5) NULL;
GO
IF COL_LENGTH(N'dbo.seminars', N'agenda') IS NULL
    ALTER TABLE [dbo].[seminars] ADD [agenda] NVARCHAR(MAX) NULL;
GO

PRINT N'✅ Migration 2026-10-31_seminar_schedule_agenda hoàn tất.';
GO
