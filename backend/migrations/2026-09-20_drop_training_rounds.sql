/* ============================================================================
 * Xoá "Đợt đào tạo" (training_rounds) khỏi hệ thống
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   training_rounds chỉ là khung thời gian mỏng (tên/năm/ngày) gắn nhãn cho
 *   Khóa học — không có logic đăng ký nào cả, toàn bộ đăng ký (công khai lẫn
 *   nội bộ) đã nằm sẵn ở courses/course_enrollments từ migration
 *   2026-09-15_course_enrollment_window. Quyết định: xoá hẳn khỏi hệ thống
 *   (bảng, cột FK trên courses, quyền liên quan) thay vì chỉ ẩn UI, và thay
 *   khái niệm "đăng ký công khai với người ngoại viện" bằng 1 cờ ngay trên
 *   Khóa học (is_public_registration) — gate cổng đăng ký không cần đăng nhập
 *   (publicPortalService.getOpenCourses).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Cờ đăng ký công khai / nội bộ trên Khóa học.
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.courses', 'is_public_registration') IS NULL
    ALTER TABLE [dbo].[courses] ADD [is_public_registration] BIT NOT NULL CONSTRAINT DF_courses_is_public_registration DEFAULT (0);
GO

------------------------------------------------------------------------------
-- 2. Gỡ FK/index của courses.training_round_id rồi xoá cột.
------------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_courses_round' AND parent_object_id = OBJECT_ID(N'dbo.courses'))
    ALTER TABLE [dbo].[courses] DROP CONSTRAINT [FK_courses_round];
GO
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_courses_round' AND object_id = OBJECT_ID(N'dbo.courses'))
    DROP INDEX [IX_courses_round] ON [dbo].[courses];
GO
IF COL_LENGTH('dbo.courses', 'training_round_id') IS NOT NULL
    ALTER TABLE [dbo].[courses] DROP COLUMN [training_round_id];
GO

------------------------------------------------------------------------------
-- 3. Xoá bảng training_round_phases rồi training_rounds (phases có FK
--    ON DELETE CASCADE tới training_rounds nên xoá phases trước).
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.training_round_phases', N'U') IS NOT NULL
    DROP TABLE [dbo].[training_round_phases];
GO
IF OBJECT_ID(N'dbo.training_rounds', N'U') IS NOT NULL
    DROP TABLE [dbo].[training_rounds];
GO

------------------------------------------------------------------------------
-- 4. Dọn quyền nhóm 'training_rounds' (PERM-TRND-*) — xoá role_permissions
--    trước rồi mới xoá permissions vì role_permissions FK tới permissions.
------------------------------------------------------------------------------
DELETE rp
FROM [dbo].[role_permissions] rp
JOIN [dbo].[permissions] p ON p.id = rp.permission_id
WHERE p.resource = 'training_rounds';
GO
DELETE FROM [dbo].[permissions] WHERE resource = 'training_rounds';
GO

PRINT N'✅ Migration 2026-09-20_drop_training_rounds hoàn tất.';
GO
