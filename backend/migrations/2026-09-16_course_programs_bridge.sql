/* ============================================================================
 * Bridge N:N giữa Khóa học (courses) và Chương trình đào tạo (training_programs)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   2026-09-11_training_operations đã cố tình đơn giản hóa so với bản gốc
 *   QLNCKHDTCDT-main: 1 course chỉ gắn 1 program qua courses.program_id
 *   (many-to-one), thay vì bridge dt_khoa_hoc_chuong_trinh (N:N, mỗi cặp có
 *   lịch/địa điểm/giảng viên/trạng thái riêng). Nay xác nhận cần đúng mô hình
 *   N:N của bản gốc: 1 chương trình có thể áp dụng cho nhiều khóa/đợt khác
 *   nhau, mỗi lần áp dụng có lịch riêng.
 *
 *   PHẠM VI: chỉ đổi quan hệ courses<->training_programs sang N:N qua bảng
 *   course_programs. Các bảng vận hành con (course_enrollments,
 *   lecturer_assignments, class_sessions, course_documents, grades,
 *   certificates) VẪN trỏ thẳng course_id như hiện tại — không rewire theo
 *   bridge id (khác bản gốc PHP), vì 1 "course" ở RMS đã là 1 lớp học vận
 *   hành cụ thể, không cần tách nhỏ hơn theo từng chương trình áp dụng.
 *
 *   Dữ liệu cũ: mỗi course đang có program_id sẽ được chuyển thành 1 dòng
 *   course_programs (dùng start_date/end_date của course làm giá trị khởi
 *   tạo), sau đó cột courses.program_id bị xoá (theo đúng pattern UPDATE rồi
 *   DROP COLUMN đã dùng ở 2026-09-15_course_enrollment_window.sql).
 *
 *   Không thêm permission mới — dùng lại courses:read/courses:update (sub-
 *   resource của course, đúng convention gộp permission theo cụm).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Bảng bridge course_programs
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.course_programs', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[course_programs] (
        [id]                     VARCHAR(20)   NOT NULL PRIMARY KEY,
        [course_id]              VARCHAR(20)   NOT NULL,
        [program_id]             VARCHAR(20)   NOT NULL,
        [start_date]             DATE          NULL,
        [end_date]               DATE          NULL,
        [location]               NVARCHAR(200) NULL,
        [lecturer_id]            VARCHAR(20)   NULL,
        [external_lecturer_name] NVARCHAR(150) NULL,
        [status]                 VARCHAR(15)   NOT NULL CONSTRAINT DF_course_programs_status DEFAULT ('active'),
        [created_at]             DATETIME      NOT NULL CONSTRAINT DF_course_programs_created_at DEFAULT (GETDATE()),
        [created_by]             VARCHAR(20)   NULL,
        [updated_at]             DATETIME      NULL,
        [updated_by]             VARCHAR(20)   NULL,
        CONSTRAINT FK_crsprog_course   FOREIGN KEY ([course_id])   REFERENCES [dbo].[courses]           ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_crsprog_program  FOREIGN KEY ([program_id])  REFERENCES [dbo].[training_programs] ([id]),
        CONSTRAINT FK_crsprog_lecturer FOREIGN KEY ([lecturer_id]) REFERENCES [dbo].[lecturers]          ([id]),
        CONSTRAINT UQ_crsprog_course_program UNIQUE ([course_id], [program_id])
    );
    CREATE NONCLUSTERED INDEX [IX_course_programs_course]  ON [dbo].[course_programs] ([course_id]);
    CREATE NONCLUSTERED INDEX [IX_course_programs_program] ON [dbo].[course_programs] ([program_id]);
END
GO

------------------------------------------------------------------------------
-- 2. Chuyển dữ liệu cũ: mỗi course có program_id -> 1 dòng course_programs
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.courses', 'program_id') IS NOT NULL
BEGIN
    INSERT INTO [dbo].[course_programs] (id, course_id, program_id, start_date, end_date, status, created_by)
    SELECT
        'CP' + LEFT(REPLACE(NEWID(), '-', ''), 18),
        c.id,
        c.program_id,
        c.start_date,
        c.end_date,
        'active',
        c.created_by
    FROM [dbo].[courses] c
    WHERE c.program_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM [dbo].[course_programs] cp
          WHERE cp.course_id = c.id AND cp.program_id = c.program_id
      );
END
GO

------------------------------------------------------------------------------
-- 3. Bỏ courses.program_id — quan hệ với chương trình giờ đi qua course_programs
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.courses', 'program_id') IS NOT NULL
BEGIN
    DECLARE @fk_name NVARCHAR(128);
    SELECT @fk_name = name FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'dbo.courses')
      AND referenced_object_id = OBJECT_ID(N'dbo.training_programs');
    IF @fk_name IS NOT NULL
        EXEC('ALTER TABLE [dbo].[courses] DROP CONSTRAINT [' + @fk_name + ']');
END
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_courses_program' AND object_id = OBJECT_ID(N'dbo.courses'))
BEGIN
    DROP INDEX [IX_courses_program] ON [dbo].[courses];
END
GO

IF COL_LENGTH('dbo.courses', 'program_id') IS NOT NULL
BEGIN
    ALTER TABLE [dbo].[courses] DROP COLUMN [program_id];
END
GO

PRINT N'✅ Migration 2026-09-16_course_programs_bridge hoàn tất.';
GO
