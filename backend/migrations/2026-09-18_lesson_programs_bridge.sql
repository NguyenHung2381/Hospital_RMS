/* ============================================================================
 * Bridge N:N giữa Bài học (program_lessons) và Chương trình đào tạo
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   2026-09-17_program_lessons đã cố tình đơn giản hóa: 1 bài học chỉ gắn 1
 *   chương trình qua program_lessons.program_id (many-to-one). Nay xác nhận
 *   cần N:N thực sự — 1 bài học (nội dung dùng chung) có thể được nhiều
 *   chương trình đào tạo khác nhau cùng sử dụng lại, mỗi chương trình có thể
 *   sắp bài học đó ở thứ tự khác nhau. Đúng mô hình đã áp dụng cho
 *   courses<->training_programs (xem 2026-09-16_course_programs_bridge.sql) —
 *   bridge lesson_programs mirror course_programs.
 *
 *   PHẠM VI: program_lessons trở thành nội dung dùng chung (chỉ còn
 *   title/description), KHÔNG còn thuộc 1 chương trình cụ thể. display_order
 *   chuyển sang bảng bridge (lesson_programs) vì thứ tự là thuộc tính của
 *   "lượt gắn vào 1 chương trình", không phải thuộc tính riêng của bài học.
 *
 *   lesson_documents VẪN trỏ thẳng lesson_id như cũ — tài liệu dùng chung
 *   theo đúng nội dung bài học, bất kể bài học đang gắn ở chương trình nào.
 *
 *   Dữ liệu cũ: mỗi program_lessons đang có program_id sẽ được chuyển thành
 *   1 dòng lesson_programs (dùng display_order cũ), sau đó cột
 *   program_lessons.program_id và display_order bị xoá (theo đúng pattern
 *   UPDATE rồi DROP COLUMN đã dùng ở 2026-09-16_course_programs_bridge.sql).
 *
 *   Không thêm permission mới — dùng lại training_programs:read/update.
 *
 *   lesson_programs.program_id KHÔNG cascade (chỉ lesson_id cascade) — SQL
 *   Server chặn 2 đường CASCADE cùng hội tụ vào 1 bảng; đúng lựa chọn đã dùng
 *   cho course_programs.FK_crsprog_program (course_id cascade, program_id
 *   không). Hệ quả: phải unlinkLesson hết trước khi xoá được 1 training_program
 *   còn bài học đang gắn — service layer không xử lý gì thêm, để lỗi FK tự
 *   chặn giống course_programs.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Bảng bridge lesson_programs
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.lesson_programs', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[lesson_programs] (
        [id]            VARCHAR(20) NOT NULL PRIMARY KEY,
        [lesson_id]     VARCHAR(20) NOT NULL,
        [program_id]    VARCHAR(20) NOT NULL,
        [display_order] INT         NOT NULL CONSTRAINT DF_lesson_programs_display_order DEFAULT (0),
        [created_at]    DATETIME    NOT NULL CONSTRAINT DF_lesson_programs_created_at DEFAULT (GETDATE()),
        [created_by]    VARCHAR(20) NULL,
        CONSTRAINT FK_lsnprog_lesson  FOREIGN KEY ([lesson_id])  REFERENCES [dbo].[program_lessons]   ([id]) ON DELETE CASCADE,
        -- program_id KHÔNG cascade (mirror course_programs.FK_crsprog_program) — SQL
        -- Server chặn 2 đường CASCADE cùng hội tụ vào lesson_programs. Hệ quả: phải gỡ
        -- hết lượt gắn bài học (unlinkLesson) trước khi xoá được 1 training_program,
        -- giống hệt cách course_programs đang chặn xoá chương trình còn khóa áp dụng.
        CONSTRAINT FK_lsnprog_program FOREIGN KEY ([program_id]) REFERENCES [dbo].[training_programs] ([id]),
        CONSTRAINT UQ_lsnprog_lesson_program UNIQUE ([lesson_id], [program_id])
    );
    CREATE NONCLUSTERED INDEX [IX_lesson_programs_lesson]  ON [dbo].[lesson_programs] ([lesson_id]);
    CREATE NONCLUSTERED INDEX [IX_lesson_programs_program] ON [dbo].[lesson_programs] ([program_id]);
END
GO

------------------------------------------------------------------------------
-- 2. Chuyển dữ liệu cũ: mỗi program_lessons có program_id -> 1 dòng lesson_programs
--    Dùng EXEC(N'...') vì program_id có thể đã bị xoá ở lần chạy trước — SQL
--    Server bind cột ngay lúc parse batch dù nằm trong IF chưa chắc chạy,
--    nên phải hoãn parse sang lúc thực thi bằng dynamic SQL.
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.program_lessons', 'program_id') IS NOT NULL
BEGIN
    EXEC(N'
        INSERT INTO [dbo].[lesson_programs] (id, lesson_id, program_id, display_order, created_by)
        SELECT
            ''LP'' + LEFT(REPLACE(NEWID(), ''-'', ''''), 18),
            pl.id,
            pl.program_id,
            pl.display_order,
            pl.created_by
        FROM [dbo].[program_lessons] pl
        WHERE pl.program_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM [dbo].[lesson_programs] lp
              WHERE lp.lesson_id = pl.id AND lp.program_id = pl.program_id
          );
    ');
END
GO

------------------------------------------------------------------------------
-- 3. Bỏ program_lessons.program_id — quan hệ với chương trình giờ đi qua
--    lesson_programs
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.program_lessons', 'program_id') IS NOT NULL
BEGIN
    DECLARE @fk_name NVARCHAR(128);
    SELECT @fk_name = name FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'dbo.program_lessons')
      AND referenced_object_id = OBJECT_ID(N'dbo.training_programs');
    IF @fk_name IS NOT NULL
        EXEC('ALTER TABLE [dbo].[program_lessons] DROP CONSTRAINT [' + @fk_name + ']');
END
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_program_lessons_program' AND object_id = OBJECT_ID(N'dbo.program_lessons'))
BEGIN
    DROP INDEX [IX_program_lessons_program] ON [dbo].[program_lessons];
END
GO

IF COL_LENGTH('dbo.program_lessons', 'program_id') IS NOT NULL
BEGIN
    EXEC(N'ALTER TABLE [dbo].[program_lessons] DROP COLUMN [program_id];');
END
GO

------------------------------------------------------------------------------
-- 4. Bỏ program_lessons.display_order — thứ tự giờ thuộc về lesson_programs
------------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_program_lessons_display_order' AND parent_object_id = OBJECT_ID(N'dbo.program_lessons'))
BEGIN
    ALTER TABLE [dbo].[program_lessons] DROP CONSTRAINT [DF_program_lessons_display_order];
END
GO

IF COL_LENGTH('dbo.program_lessons', 'display_order') IS NOT NULL
BEGIN
    EXEC(N'ALTER TABLE [dbo].[program_lessons] DROP COLUMN [display_order];');
END
GO

PRINT N'✅ Migration 2026-09-18_lesson_programs_bridge hoàn tất.';
GO
