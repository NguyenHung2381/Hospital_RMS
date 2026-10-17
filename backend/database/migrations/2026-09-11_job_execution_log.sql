/* ============================================================================
 * Bảng chống gửi trùng cho cron job nền (nhắc deadline, bảo trì tài khoản)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Hệ thống chưa có cron job nào (deadlineGuard chỉ kiểm tra PHẢN ỨNG khi
 *   người dùng thao tác, không có job CHỦ ĐỘNG nhắc trước deadline như bản
 *   PHP nguồn — cron_nckh_nhac_viec.php). Thêm job nền cần một cách đảm bảo
 *   "gửi đúng 1 lần" cho mỗi (job, khoá) — bảng này dùng UNIQUE constraint để
 *   INSERT lần 2 tự thất bại thay vì phải SELECT-rồi-INSERT (tránh race
 *   condition nếu job chạy trùng giờ do server restart).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.job_execution_log', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[job_execution_log] (
        [id]         BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [job_name]   VARCHAR(50)  NOT NULL,
        [dedupe_key] VARCHAR(150) NOT NULL,
        [run_at]     DATETIME     NOT NULL CONSTRAINT DF_job_execution_log_run_at DEFAULT (GETDATE()),
        CONSTRAINT UQ_job_execution_log_job_key UNIQUE ([job_name], [dedupe_key])
    );
END
GO

PRINT N'✅ Migration 2026-09-11_job_execution_log hoàn tất.';
GO
