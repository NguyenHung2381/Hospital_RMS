/* ============================================================================
 * Gán điểm (grades) trực tiếp vào chương trình đào tạo cụ thể
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   1 khóa học (course) có thể áp dụng nhiều chương trình đào tạo cùng lúc
 *   (course_programs, N:N — xem 2026-09-16_course_programs_bridge.sql). Khi
 *   cần thống kê kết quả học viên theo từng chương trình trong phạm vi 1 khóa
 *   học, KHÔNG suy ra chương trình qua subject_id (gián tiếp, dễ sai khi 1
 *   môn thuộc nhiều chương trình) — thay vào đó thêm thẳng cột program_id,
 *   do giáo vụ tự chọn khi nhập điểm (dropdown từ course_programs của khóa
 *   đó). program_id là 1 trường bổ sung, ĐỘC LẬP với subject_id, trên cùng 1
 *   dòng điểm — không đổi khóa upsert hiện tại (enrollment_id, subject_id).
 *
 *   Không thêm permission mới — dùng lại courses:read/update.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.grades', 'program_id') IS NULL
    ALTER TABLE [dbo].[grades] ADD [program_id] VARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_grades_program' AND parent_object_id = OBJECT_ID(N'dbo.grades'))
    ALTER TABLE [dbo].[grades] WITH CHECK
        ADD CONSTRAINT [FK_grades_program] FOREIGN KEY ([program_id]) REFERENCES [dbo].[training_programs] ([id]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_grades_program' AND object_id = OBJECT_ID(N'dbo.grades'))
    CREATE NONCLUSTERED INDEX [IX_grades_program] ON [dbo].[grades] ([program_id]);
GO

PRINT N'✅ Migration 2026-09-17_grades_program hoàn tất.';
GO
