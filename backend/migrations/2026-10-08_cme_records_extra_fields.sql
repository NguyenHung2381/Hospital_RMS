/* ============================================================================
 * cme_records — bổ sung trường theo "Sổ theo dõi tín chỉ CME" (Excel)
 * ----------------------------------------------------------------------------
 *   + role      Vai trò (Đại biểu, Báo cáo viên...)
 *   + quantity  Số lượng (số buổi/giờ/năm... theo conversion_method)
 *   + end_date  Đến ngày (activity_date = Từ ngày)
 *   activity_date cho phép NULL (sổ cũ không có ngày); year chuyển từ cột tính
 *   (YEAR(activity_date)) thành cột thường, backfill từ activity_date.
 * Idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.cme_records', 'role') IS NULL
    ALTER TABLE [dbo].[cme_records] ADD [role] NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.cme_records', 'quantity') IS NULL
    ALTER TABLE [dbo].[cme_records] ADD [quantity] DECIMAL(8,2) NULL;
IF COL_LENGTH('dbo.cme_records', 'end_date') IS NULL
    ALTER TABLE [dbo].[cme_records] ADD [end_date] DATE NULL;
GO

IF EXISTS (SELECT 1 FROM sys.computed_columns WHERE object_id = OBJECT_ID(N'dbo.cme_records') AND name = 'year')
BEGIN
    DROP INDEX [IX_cme_records_user_year] ON [dbo].[cme_records];
    ALTER TABLE [dbo].[cme_records] DROP COLUMN [year];
    ALTER TABLE [dbo].[cme_records] ADD [year] INT NULL;
END
GO

UPDATE [dbo].[cme_records] SET [year] = YEAR([activity_date]) WHERE [year] IS NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.cme_records') AND name = 'activity_date' AND is_nullable = 0)
    ALTER TABLE [dbo].[cme_records] ALTER COLUMN [activity_date] DATE NULL;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.cme_records') AND name = 'year' AND is_nullable = 1)
    ALTER TABLE [dbo].[cme_records] ALTER COLUMN [year] INT NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cme_records_user_year' AND object_id = OBJECT_ID(N'dbo.cme_records'))
    CREATE NONCLUSTERED INDEX [IX_cme_records_user_year] ON [dbo].[cme_records] ([user_id], [year]);
GO
