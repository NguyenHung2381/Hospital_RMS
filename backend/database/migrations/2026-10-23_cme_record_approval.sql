/* ============================================================================
 * cme_records — người dùng tự khai, admin duyệt mới được tính tín chỉ
 * ----------------------------------------------------------------------------
 *   approval_status: pending | approved | rejected (bản ghi cũ/admin tạo = approved)
 *   Chỉ 'approved' được cộng vào tín chỉ CME. Idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.cme_records', 'approval_status') IS NULL
    ALTER TABLE [dbo].[cme_records] ADD [approval_status] VARCHAR(20) NOT NULL
        CONSTRAINT DF_cme_records_approval DEFAULT 'approved'
        CONSTRAINT CHK_cme_records_approval CHECK ([approval_status] IN ('pending','approved','rejected'));
IF COL_LENGTH('dbo.cme_records', 'reviewed_by') IS NULL
    ALTER TABLE [dbo].[cme_records] ADD [reviewed_by] VARCHAR(20) NULL, [reviewed_at] DATETIME NULL, [reject_reason] NVARCHAR(500) NULL;
GO
