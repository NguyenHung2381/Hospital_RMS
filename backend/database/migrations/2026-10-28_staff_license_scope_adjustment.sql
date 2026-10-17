/* ============================================================================
 * CCHN — điều chỉnh/bổ sung phạm vi hoạt động chuyên môn
 * ----------------------------------------------------------------------------
 * File "Danh sách người hành nghề" (xuất từ phần mềm Sở Y tế) có 3 cột mà
 * staff_practice_licenses chưa lưu: Quyết định bổ sung phạm vi, Điều chỉnh phạm
 * vi HĐCM trong CCHN, Ngày điều chỉnh phạm vi. Script idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.staff_practice_licenses', 'scope_decision_no') IS NULL
    ALTER TABLE [dbo].[staff_practice_licenses] ADD [scope_decision_no] NVARCHAR(100) NULL; -- QĐ bổ sung phạm vi
GO
IF COL_LENGTH('dbo.staff_practice_licenses', 'adjusted_scope') IS NULL
    ALTER TABLE [dbo].[staff_practice_licenses] ADD [adjusted_scope] NVARCHAR(500) NULL; -- phạm vi HĐCM sau điều chỉnh
GO
IF COL_LENGTH('dbo.staff_practice_licenses', 'scope_adjusted_date') IS NULL
    ALTER TABLE [dbo].[staff_practice_licenses] ADD [scope_adjusted_date] DATE NULL;
GO

PRINT N'✅ Migration 2026-10-28_staff_license_scope_adjustment hoàn tất.';
GO
