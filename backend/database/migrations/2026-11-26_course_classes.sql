/* ============================================================================
 * Lớp = chương trình trong khóa (ĐTLT / CTCV) — bỏ khóa tuyển sinh + đợt con
 * ----------------------------------------------------------------------------
 * Xem docs/ke-hoach-nang-cap-dao-tao.md, mục "Điều chỉnh 2026-10-22".
 *
 *   course_programs.opened_at/opened_by : cán bộ bấm "Mở lớp" (lớp đủ sĩ số tối
 *       thiểu thì hệ thống chỉ báo, không tự mở). Lớp chưa mở ⇒ chưa xếp lịch.
 *   Bỏ courses.auto_batch / parent_course_id (2026-11-15_course_batches): đợt con
 *       thành khóa thường; người chờ ở khóa tuyển sinh giữ 'waitlisted' = nằm trong
 *       danh sách chờ của chương trình, khóa mới có chương trình đó tự kéo về.
 *   courses.capacity giữ cột cho dữ liệu cũ, không dùng nữa.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.course_programs', N'opened_at') IS NULL
BEGIN
    ALTER TABLE [dbo].[course_programs] ADD [opened_at] DATETIME NULL, [opened_by] VARCHAR(20) NULL;
    -- Lớp đang chạy theo luật cũ (đủ tối thiểu là mở, hoặc đã có buổi học) ⇒ coi như đã mở.
    EXEC(N'
    UPDATE cp SET opened_at = GETDATE()
    FROM course_programs cp
    JOIN courses c ON c.id = cp.course_id
    JOIN training_programs tp ON tp.id = cp.program_id
    WHERE c.training_type_id IN (''TRNTP-DTLT'', ''TRNTP-CTCV'') AND c.is_rolling = 0
      AND ((SELECT COUNT(*) FROM course_enrollments e
            WHERE e.course_id = c.id AND e.program_id = cp.program_id AND e.status = ''approved'') >= ISNULL(tp.min_capacity, 1)
           OR EXISTS (SELECT 1 FROM class_sessions s WHERE s.course_id = c.id));');
END
GO

IF COL_LENGTH(N'dbo.courses', N'parent_course_id') IS NOT NULL
BEGIN
    IF OBJECT_ID(N'dbo.FK_courses_parent', N'F') IS NOT NULL
        ALTER TABLE [dbo].[courses] DROP CONSTRAINT [FK_courses_parent];
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_courses_parent' AND object_id = OBJECT_ID(N'dbo.courses'))
        DROP INDEX [IX_courses_parent] ON [dbo].[courses];
    ALTER TABLE [dbo].[courses] DROP COLUMN [parent_course_id];
END
GO

IF COL_LENGTH(N'dbo.courses', N'auto_batch') IS NOT NULL
BEGIN
    IF OBJECT_ID(N'dbo.DF_courses_auto_batch', N'D') IS NOT NULL
        ALTER TABLE [dbo].[courses] DROP CONSTRAINT [DF_courses_auto_batch];
    ALTER TABLE [dbo].[courses] DROP COLUMN [auto_batch];
END
GO

PRINT N'✅ Migration 2026-11-26_course_classes hoàn tất.';
GO
