/* ============================================================================
 * Bổ sung trường tài chính & số quyết định cho đề tài NCKH
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu với hệ thống NCKH của Bệnh viện Hữu nghị Đa khoa Nghệ An
 *   (QLNCKHDTCDT-main, bảng nckh_de_tai): đề tài bên đó có kinh phí dự toán/
 *   thực tế và số + ngày quyết định phê duyệt/công nhận — Hospital_RMS chưa
 *   có các trường này trên `topics`. Bổ sung để theo dõi được kinh phí và hồ
 *   sơ quyết định chính thức của đề tài.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.topics', N'budget_estimated') IS NULL
    ALTER TABLE [dbo].[topics] ADD [budget_estimated] DECIMAL(18,2) NULL;
GO
IF COL_LENGTH(N'dbo.topics', N'budget_actual') IS NULL
    ALTER TABLE [dbo].[topics] ADD [budget_actual] DECIMAL(18,2) NULL;
GO
IF COL_LENGTH(N'dbo.topics', N'approval_decision_no') IS NULL
    ALTER TABLE [dbo].[topics] ADD [approval_decision_no] NVARCHAR(100) NULL;
GO
IF COL_LENGTH(N'dbo.topics', N'approval_decision_date') IS NULL
    ALTER TABLE [dbo].[topics] ADD [approval_decision_date] DATE NULL;
GO
IF COL_LENGTH(N'dbo.topics', N'recognition_decision_no') IS NULL
    ALTER TABLE [dbo].[topics] ADD [recognition_decision_no] NVARCHAR(100) NULL;
GO
IF COL_LENGTH(N'dbo.topics', N'recognition_decision_date') IS NULL
    ALTER TABLE [dbo].[topics] ADD [recognition_decision_date] DATE NULL;
GO

PRINT N'✅ Migration 2026-09-11_topic_budget_decision_fields hoàn tất.';
GO
