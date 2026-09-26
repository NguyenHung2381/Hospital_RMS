/* ============================================================================
 * Bổ sung loại mốc thời gian "Đăng ký đề tài" (topic_registration)
 * ----------------------------------------------------------------------------
 *   topic_registration — "Đăng ký đề tài": khoảng thời gian mở đăng ký đề tài
 *
 * - Mở rộng CHECK constraint CHK_rd_type để chấp nhận 'topic_registration'.
 * Script idempotent, chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL]
GO

------------------------------------------------------------------------------
-- 1. Gỡ CHECK cũ
------------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_rd_type')
    ALTER TABLE dbo.round_deadlines DROP CONSTRAINT CHK_rd_type;
GO

------------------------------------------------------------------------------
-- 2. CHECK constraint mới (thêm 'topic_registration')
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_rd_type')
BEGIN
    ALTER TABLE dbo.round_deadlines WITH CHECK
        ADD CONSTRAINT CHK_rd_type CHECK
        (deadline_type IN
            ('topic_registration', 'edit', 'supplement', 'report_submission'));
END
GO
