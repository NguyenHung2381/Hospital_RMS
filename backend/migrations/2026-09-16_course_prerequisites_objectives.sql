/* ============================================================================
 * Thêm "Điều kiện" và "Mục tiêu" cho khóa học (courses)
 * ----------------------------------------------------------------------------
 * Cả hai đều là danh sách các mục (hiển thị dạng list đánh số 1..n ở FE) nên
 * lưu dưới dạng chuỗi JSON (mảng string) trong 1 cột NVARCHAR(MAX) — FE/BE tự
 * parse/stringify, không cần bảng phụ vì đây chỉ là text mô tả, không có quan
 * hệ hay thao tác CRUD riêng.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.courses', 'prerequisites') IS NULL
BEGIN
    ALTER TABLE [dbo].[courses] ADD [prerequisites] NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH('dbo.courses', 'objectives') IS NULL
BEGIN
    ALTER TABLE [dbo].[courses] ADD [objectives] NVARCHAR(MAX) NULL;
END
GO

PRINT N'✅ Migration 2026-09-16_course_prerequisites_objectives hoàn tất.';
GO
