/* ============================================================================
 * Gọn luồng Đào tạo: Kế hoạch → Chương trình (bài học) → Khóa học
 * ----------------------------------------------------------------------------
 * 1. courses.plan_item_id: khóa học mở theo hạng mục nào của kế hoạch đào tạo
 *    (tiến độ kế hoạch = số khóa / số học viên của hạng mục). FK không cascade —
 *    trainingPlanService gỡ liên kết trước khi xoá hạng mục/kế hoạch.
 *
 * 2. Gộp "Môn học" (subjects) vào "Bài học" (program_lessons): hai danh mục
 *    song song cùng nghĩa. Mỗi môn học → bài học cùng tên (chưa có thì tạo mới),
 *    các cột subject_id của lecturer_assignments / class_sessions / grades /
 *    question_bank / exam_papers chuyển sang trỏ bài học (giữ tên cột
 *    subject_id). program_subjects → lesson_programs. Bảng subjects và
 *    program_subjects GIỮ LẠI (không còn dùng) để có thể đối chiếu/khôi phục.
 *
 *   Server cũng tự chạy tương đương lúc khởi động (permissions/migrations.js).
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.courses', N'plan_item_id') IS NULL
    ALTER TABLE [dbo].[courses] ADD [plan_item_id] VARCHAR(20) NULL
        CONSTRAINT FK_courses_plan_item REFERENCES [dbo].[training_plan_items] ([id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_courses_plan_item' AND object_id = OBJECT_ID(N'dbo.courses'))
    CREATE NONCLUSTERED INDEX [IX_courses_plan_item] ON [dbo].[courses] ([plan_item_id]);
GO

-- Chỉ chạy khi còn FK trỏ vào subjects (ngoài program_subjects) = chưa chuyển
IF EXISTS (SELECT 1 FROM sys.foreign_keys
           WHERE referenced_object_id = OBJECT_ID(N'dbo.subjects')
             AND parent_object_id <> OBJECT_ID(N'dbo.program_subjects'))
BEGIN
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;

    INSERT INTO [dbo].[program_lessons] (id, code, title, description, created_by)
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), '', LEFT(s.name, 255), s.description, s.created_by
    FROM [dbo].[subjects] s
    WHERE NOT EXISTS (SELECT 1 FROM [dbo].[program_lessons] l WHERE l.title = LEFT(s.name, 255));

    SELECT s.id AS subject_id,
           (SELECT TOP 1 l.id FROM [dbo].[program_lessons] l WHERE l.title = LEFT(s.name, 255) ORDER BY l.created_at) AS lesson_id
    INTO #subject_lesson
    FROM [dbo].[subjects] s;

    DECLARE @drop NVARCHAR(MAX) = N'';
    SELECT @drop += N'ALTER TABLE ' + QUOTENAME(OBJECT_NAME(parent_object_id)) + N' DROP CONSTRAINT ' + QUOTENAME(name) + N';'
    FROM sys.foreign_keys
    WHERE referenced_object_id = OBJECT_ID(N'dbo.subjects') AND parent_object_id <> OBJECT_ID(N'dbo.program_subjects');
    EXEC (@drop);

    UPDATE t SET subject_id = m.lesson_id FROM [dbo].[lecturer_assignments] t JOIN #subject_lesson m ON m.subject_id = t.subject_id;
    UPDATE t SET subject_id = m.lesson_id FROM [dbo].[class_sessions] t JOIN #subject_lesson m ON m.subject_id = t.subject_id;
    UPDATE t SET subject_id = m.lesson_id FROM [dbo].[grades] t JOIN #subject_lesson m ON m.subject_id = t.subject_id;
    UPDATE t SET subject_id = m.lesson_id FROM [dbo].[question_bank] t JOIN #subject_lesson m ON m.subject_id = t.subject_id;
    UPDATE t SET subject_id = m.lesson_id FROM [dbo].[exam_papers] t JOIN #subject_lesson m ON m.subject_id = t.subject_id;

    INSERT INTO [dbo].[lesson_programs] (id, lesson_id, program_id)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), x.lesson_id, x.program_id
    FROM (SELECT DISTINCT m.lesson_id, ps.program_id
          FROM [dbo].[program_subjects] ps
          JOIN #subject_lesson m ON m.subject_id = ps.subject_id) x
    WHERE NOT EXISTS (SELECT 1 FROM [dbo].[lesson_programs] lp WHERE lp.lesson_id = x.lesson_id AND lp.program_id = x.program_id);

    ALTER TABLE [dbo].[lecturer_assignments] ADD CONSTRAINT FK_lecass_lesson FOREIGN KEY ([subject_id]) REFERENCES [dbo].[program_lessons] ([id]);
    ALTER TABLE [dbo].[class_sessions] ADD CONSTRAINT FK_sess_lesson FOREIGN KEY ([subject_id]) REFERENCES [dbo].[program_lessons] ([id]);
    ALTER TABLE [dbo].[grades] ADD CONSTRAINT FK_grades_lesson FOREIGN KEY ([subject_id]) REFERENCES [dbo].[program_lessons] ([id]);
    ALTER TABLE [dbo].[question_bank] ADD CONSTRAINT FK_qbank_lesson FOREIGN KEY ([subject_id]) REFERENCES [dbo].[program_lessons] ([id]);
    ALTER TABLE [dbo].[exam_papers] ADD CONSTRAINT FK_exampaper_lesson FOREIGN KEY ([subject_id]) REFERENCES [dbo].[program_lessons] ([id]);

    DROP TABLE #subject_lesson;
    COMMIT TRANSACTION;
END
GO

PRINT N'✅ Migration 2026-11-01_training_flow hoàn tất.';
GO
