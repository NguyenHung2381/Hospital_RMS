/* ============================================================================
 * Chuyển cửa sổ đăng ký khóa học từ cấp Đợt đào tạo xuống cấp Khóa học
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   training_rounds.enrollment_start/end_date (thêm ở 2026-09-11_training_
 *   operations) áp đặt DUY NHẤT MỘT cửa sổ đăng ký cho mọi khóa học trong cùng
 *   một đợt. Thực tế một đợt đào tạo có nhiều khóa học và mỗi khóa có lịch
 *   tuyển sinh riêng (khóa khai giảng tháng 3 mở đăng ký khác khóa tháng 5
 *   trong cùng đợt Quý 1) — nên cửa sổ đăng ký phải thuộc về courses, không
 *   phải training_rounds.
 *
 *   Dữ liệu cũ: nếu đợt đã có cấu hình cửa sổ đăng ký, copy xuống các khóa học
 *   thuộc đợt đó (courses chưa tự cấu hình) trước khi xoá cột ở training_rounds.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Thêm cửa sổ đăng ký vào courses
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.courses', 'enrollment_start_date') IS NULL
BEGIN
    ALTER TABLE [dbo].[courses] ADD [enrollment_start_date] DATE NULL;
END
GO

IF COL_LENGTH('dbo.courses', 'enrollment_end_date') IS NULL
BEGIN
    ALTER TABLE [dbo].[courses] ADD [enrollment_end_date] DATE NULL;
END
GO

------------------------------------------------------------------------------
-- 2. Chuyển dữ liệu cũ từ training_rounds xuống courses (chỉ khi cột nguồn
--    còn tồn tại và khóa học chưa tự cấu hình cửa sổ riêng).
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.training_rounds', 'enrollment_start_date') IS NOT NULL
BEGIN
    UPDATE c
    SET c.enrollment_start_date = r.enrollment_start_date,
        c.enrollment_end_date   = r.enrollment_end_date
    FROM [dbo].[courses] c
    JOIN [dbo].[training_rounds] r ON r.id = c.training_round_id
    WHERE c.enrollment_start_date IS NULL
      AND c.enrollment_end_date IS NULL
      AND (r.enrollment_start_date IS NOT NULL OR r.enrollment_end_date IS NOT NULL);
END
GO

------------------------------------------------------------------------------
-- 3. Bỏ cửa sổ đăng ký khỏi training_rounds — đợt đào tạo giờ chỉ còn là
--    khung thời gian (tên, năm, start/end_date), không quyết định đăng ký.
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.training_rounds', 'enrollment_start_date') IS NOT NULL
BEGIN
    ALTER TABLE [dbo].[training_rounds] DROP COLUMN [enrollment_start_date];
END
GO

IF COL_LENGTH('dbo.training_rounds', 'enrollment_end_date') IS NOT NULL
BEGIN
    ALTER TABLE [dbo].[training_rounds] DROP COLUMN [enrollment_end_date];
END
GO

PRINT N'✅ Migration 2026-09-15_course_enrollment_window hoàn tất.';
GO
