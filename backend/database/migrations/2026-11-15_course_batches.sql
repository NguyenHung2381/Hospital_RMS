/* ============================================================================
 * Khóa tuyển sinh theo đợt (ĐTLT / CTCV) — đủ sĩ số thì thành một đợt
 * ----------------------------------------------------------------------------
 * Xem docs/ke-hoach-nang-cap-dao-tao.md, giai đoạn 2.
 *
 *   courses.auto_batch = 1  : KHÓA TUYỂN SINH — nhận đăng ký liên tục, không có
 *                             lịch học; học viên đã duyệt nằm ở "danh sách chờ"
 *                             (course_enrollments.status = 'waitlisted') tới khi
 *                             đủ sĩ số tối thiểu của chương trình thì được chuyển
 *                             sang một ĐỢT. Không dùng is_rolling — cờ đó mang
 *                             nghĩa khóa thực hành GPHN (tự xếp vòng khoa).
 *   courses.parent_course_id : ĐỢT (khóa học bình thường, 1 chương trình) trỏ về
 *                             khóa tuyển sinh. Không cascade — xoá khóa tuyển sinh
 *                             còn đợt thì service chặn.
 *
 *   Sĩ số tối thiểu / tối đa mỗi đợt lấy theo chương trình
 *   (training_programs.min_capacity / max_capacity — đã có).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.courses', N'auto_batch') IS NULL
    ALTER TABLE [dbo].[courses] ADD [auto_batch] BIT NOT NULL
        CONSTRAINT DF_courses_auto_batch DEFAULT (0);
GO
IF COL_LENGTH(N'dbo.courses', N'parent_course_id') IS NULL
    ALTER TABLE [dbo].[courses] ADD [parent_course_id] VARCHAR(20) NULL
        CONSTRAINT FK_courses_parent REFERENCES [dbo].[courses] ([id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_courses_parent' AND object_id = OBJECT_ID(N'dbo.courses'))
    CREATE NONCLUSTERED INDEX [IX_courses_parent] ON [dbo].[courses] ([parent_course_id]) WHERE [parent_course_id] IS NOT NULL;
GO

PRINT N'✅ Migration 2026-11-15_course_batches hoàn tất.';
GO
