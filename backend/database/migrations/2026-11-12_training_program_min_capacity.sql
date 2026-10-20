/* ============================================================================
 * Sĩ số tối thiểu của chương trình đào tạo (cột "Tối thiểu" trong file Chi tiết
 * chương trình học ĐTLT của phòng Đào tạo; "Tối đa" đã có ở max_capacity).
 *
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.training_programs', 'min_capacity') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [min_capacity] INT NULL;
GO

PRINT N'✅ Migration 2026-11-12_training_program_min_capacity hoàn tất.';
GO
