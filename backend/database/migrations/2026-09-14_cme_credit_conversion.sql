/* ============================================================================
 * Danh mục quy đổi tín chỉ CME (Giai đoạn 6)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu file dump `ql_nckh_dt_cdt`: dt_cme_nhom (nhóm hoạt động) +
 *   dt_cme_loai (loại hoạt động, có công thức quy đổi kieu_quy_doi/gia_tri_quy_doi)
 *   cho phép hệ thống GỢI Ý số tín chỉ theo loại hoạt động thay vì nhập tay.
 *
 *   Hospital_RMS hiện có cme_credit_categories (từ 2026-09-11_training_foundation)
 *   nhưng chỉ là danh mục phẳng id/name/description — KHÔNG có công thức, và
 *   KHÔNG được dùng trong cmeRequirementService.getComplianceReport() (số tín chỉ
 *   earned_credits hiện lấy thẳng từ seminar_participants.cme_credits, nhập tay).
 *
 *   Không đổi tên / không nhân đôi bảng cme_credit_categories (đã wire sẵn ở
 *   routes/lookups.js 'cme-credit-categories' + frontend danh mục đào tạo) —
 *   MỞ RỘNG tại chỗ bằng cách thêm cột, và thêm 1 bảng nhóm mới ở trên.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Nhóm hoạt động CME (mirror dt_cme_nhom — shape giống categories/levels)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.cme_credit_groups', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[cme_credit_groups] (
        [id]          VARCHAR(20)   NOT NULL PRIMARY KEY,
        [name]        NVARCHAR(255) NOT NULL,
        [description] NVARCHAR(MAX) NULL,
        [sort_order]  INT           NOT NULL CONSTRAINT DF_cme_credit_groups_sort_order DEFAULT (0),
        [created_at]  DATETIME      NOT NULL CONSTRAINT DF_cme_credit_groups_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20)   NULL,
        [updated_at]  DATETIME      NULL,
        [updated_by]  VARCHAR(20)   NULL
    );
END
GO

------------------------------------------------------------------------------
-- 2. Mở rộng cme_credit_categories với công thức quy đổi (mirror dt_cme_loai)
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.cme_credit_categories', 'group_id') IS NULL
    ALTER TABLE [dbo].[cme_credit_categories] ADD [group_id] VARCHAR(20) NULL;
GO
IF COL_LENGTH('dbo.cme_credit_categories', 'conversion_method') IS NULL
    ALTER TABLE [dbo].[cme_credit_categories] ADD [conversion_method] VARCHAR(20) NOT NULL
        CONSTRAINT DF_cme_credit_categories_conversion_method DEFAULT ('fixed');
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_cme_credit_categories_conversion_method')
    ALTER TABLE [dbo].[cme_credit_categories] ADD CONSTRAINT [CHK_cme_credit_categories_conversion_method]
        CHECK ([conversion_method] IN ('per_session','fixed','per_year'));
GO
IF COL_LENGTH('dbo.cme_credit_categories', 'conversion_value') IS NULL
    ALTER TABLE [dbo].[cme_credit_categories] ADD [conversion_value] DECIMAL(6,2) NULL;
GO
IF COL_LENGTH('dbo.cme_credit_categories', 'unit_label') IS NULL
    ALTER TABLE [dbo].[cme_credit_categories] ADD [unit_label] NVARCHAR(40) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_cmecat_group')
    ALTER TABLE [dbo].[cme_credit_categories] ADD CONSTRAINT [FK_cmecat_group]
        FOREIGN KEY ([group_id]) REFERENCES [dbo].[cme_credit_groups] ([id]);
GO

------------------------------------------------------------------------------
-- 3. Quyền — dùng lại 'training_catalog' đã có (cme_credit_categories vốn đã
--    thuộc nhóm quyền này); chỉ cần route mới cho cme_credit_groups, không cần
--    permission mới.
------------------------------------------------------------------------------

PRINT N'✅ Migration 2026-09-14_cme_credit_conversion hoàn tất.';
GO
