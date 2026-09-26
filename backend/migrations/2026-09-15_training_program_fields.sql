/* ============================================================================
 * Bổ sung trường cho training_programs (Mã, Thời lượng, Số lượng tối đa, Thứ tự)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Form "Chương trình đào tạo" cần thêm Mã chương trình, Thời lượng,
 *   Số lượng tối đa và Thứ tự hiển thị. Cột thêm đều NULL-able/có default,
 *   không phá dữ liệu hay API hiện có (chỉ thêm field optional).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.training_programs', 'code') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [code] NVARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.training_programs', 'duration') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [duration] NVARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.training_programs', 'max_capacity') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [max_capacity] INT NULL;
GO
IF COL_LENGTH('dbo.training_programs', 'display_order') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [display_order] INT NOT NULL
        CONSTRAINT DF_training_programs_display_order DEFAULT (0);
GO

PRINT N'✅ Migration 2026-09-15_training_program_fields hoàn tất.';
GO
