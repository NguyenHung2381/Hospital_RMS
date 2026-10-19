/* ============================================================================
 * Đào tạo GĐ3 — Ghi danh theo chương trình; hồ sơ thực hành GPHN; bài học
 * tự gắn cho học viên ĐTLT; bổ sung hồ sơ học viên theo sổ thực hành
 * ----------------------------------------------------------------------------
 * Xem docs/ke-hoach-sua-dao-tao.md mục 4.4, 4.6, 4.7.
 *
 * 1. course_enrollments: cột audit (created_at/by, updated_at/by) — code ghi
 *    danh đã dùng created_by/updated_at nhưng 2026-10-09_audit_columns không
 *    thêm được vào bảng này trên một số DB ⇒ ghi danh báo "Invalid column".
 * 2. course_enrollments: chương trình đã chọn (program_id) + các trường đăng ký
 *    thực hành của sổ GPHN (mã thực hành 226.BS, lĩnh vực, hình thức hành nghề,
 *    thời gian, địa điểm, đơn vị cử đi, NHD chính, tiến độ). UNIQUE đổi từ
 *    (khóa, học viên) sang (khóa, học viên, chương trình): sổ cũ có học viên đi
 *    2 hồ sơ trong cùng khóa GPHN (vd GPHN_BS_1 rồi GPHN_BS_2).
 * 3. enrollment_lessons: bài học của từng học viên — chép từ lesson_programs
 *    lúc chọn chương trình (sửa chương trình sau này không đổi hồ sơ cũ).
 * 4. trainees: nơi sinh (tỉnh), ngày tốt nghiệp, ngày cấp bằng, mã học viên sổ cũ.
 *
 * Idempotent — mỗi bước tự kiểm tra nên chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

------------------------------------------------------------------------------
-- 1. Cột audit của course_enrollments
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.course_enrollments', N'created_at') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [created_at] DATETIME2 NOT NULL
        CONSTRAINT [DF_course_enrollments_created_at] DEFAULT GETDATE();
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'created_by') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [created_by] VARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'updated_at') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [updated_at] DATETIME2 NULL;
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'updated_by') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [updated_by] VARCHAR(20) NULL;
GO

------------------------------------------------------------------------------
-- 2. Ghi danh theo chương trình + hồ sơ thực hành GPHN
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.course_enrollments', N'program_id') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [program_id] VARCHAR(20) NULL
        CONSTRAINT FK_enroll_program REFERENCES [dbo].[training_programs] ([id]);
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'practice_code') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [practice_code] NVARCHAR(30) NULL; -- mã thực hành, vd 226.BS
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'professional_field') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [professional_field] NVARCHAR(200) NULL; -- lĩnh vực chuyên môn
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'practice_form') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [practice_form] NVARCHAR(300) NULL; -- hình thức hành nghề
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'start_date') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [start_date] DATE NULL;
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'end_date') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [end_date] DATE NULL;
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'total_duration') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [total_duration] NVARCHAR(50) NULL; -- "12 tháng"
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'practice_location') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [practice_location] NVARCHAR(500) NULL;
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'sending_unit') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [sending_unit] NVARCHAR(200) NULL; -- đơn vị cử đi
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'main_mentor_user_id') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [main_mentor_user_id] VARCHAR(20) NULL
        CONSTRAINT FK_enroll_main_mentor REFERENCES [dbo].[users] ([id]);
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'progress_status') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [progress_status] VARCHAR(15) NOT NULL
        CONSTRAINT DF_enroll_progress_status DEFAULT ('in_progress')
        CONSTRAINT CHK_enroll_progress_status CHECK ([progress_status] IN ('in_progress', 'completed', 'dropped'));
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'progress_date') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [progress_date] DATE NULL; -- ngày hoàn thành / nghỉ học
GO
IF COL_LENGTH(N'dbo.course_enrollments', N'progress_reason') IS NULL
    ALTER TABLE [dbo].[course_enrollments] ADD [progress_reason] NVARCHAR(500) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_course_enrollments_program' AND object_id = OBJECT_ID(N'dbo.course_enrollments'))
    CREATE NONCLUSTERED INDEX [IX_course_enrollments_program] ON [dbo].[course_enrollments] ([program_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_enroll_practice_code' AND object_id = OBJECT_ID(N'dbo.course_enrollments'))
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_enroll_practice_code] ON [dbo].[course_enrollments] ([practice_code])
        WHERE [practice_code] IS NOT NULL;
GO

-- UNIQUE (khóa, học viên) → (khóa, học viên, chương trình). program_id NULL vẫn
-- chỉ được 1 dòng / cặp (khóa, học viên) như trước.
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'UQ_enroll_course_trainee' AND parent_object_id = OBJECT_ID(N'dbo.course_enrollments'))
    ALTER TABLE [dbo].[course_enrollments] DROP CONSTRAINT [UQ_enroll_course_trainee];
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_enroll_course_trainee_program' AND object_id = OBJECT_ID(N'dbo.course_enrollments'))
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_enroll_course_trainee_program]
        ON [dbo].[course_enrollments] ([course_id], [trainee_id], [program_id]);
GO

------------------------------------------------------------------------------
-- 3. Bài học của từng học viên (ĐTLT)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.enrollment_lessons', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[enrollment_lessons] (
        [enrollment_id] VARCHAR(20) NOT NULL,
        [lesson_id]     VARCHAR(20) NOT NULL,
        [display_order] INT         NOT NULL CONSTRAINT DF_enrollment_lessons_order DEFAULT (0),
        [status]        VARCHAR(15) NOT NULL CONSTRAINT DF_enrollment_lessons_status DEFAULT ('not_started'),
        [completed_at]  DATE        NULL,
        [created_at]    DATETIME2   NOT NULL CONSTRAINT DF_enrollment_lessons_created_at DEFAULT (GETDATE()),
        [updated_at]    DATETIME2   NULL,
        [updated_by]    VARCHAR(20) NULL,
        CONSTRAINT PK_enrollment_lessons PRIMARY KEY ([enrollment_id], [lesson_id]),
        CONSTRAINT FK_enrlsn_enrollment FOREIGN KEY ([enrollment_id]) REFERENCES [dbo].[course_enrollments] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_enrlsn_lesson     FOREIGN KEY ([lesson_id])     REFERENCES [dbo].[program_lessons]    ([id]) ON DELETE CASCADE,
        CONSTRAINT CHK_enrlsn_status CHECK ([status] IN ('not_started', 'in_progress', 'done'))
    );
    CREATE NONCLUSTERED INDEX [IX_enrollment_lessons_lesson] ON [dbo].[enrollment_lessons] ([lesson_id]);
END
GO

------------------------------------------------------------------------------
-- 4. Hồ sơ học viên theo sổ thực hành
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.trainees', N'birth_province') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [birth_province] NVARCHAR(100) NULL; -- nơi sinh (tỉnh)
GO
IF COL_LENGTH(N'dbo.trainees', N'graduated_date') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [graduated_date] DATE NULL;
GO
IF COL_LENGTH(N'dbo.trainees', N'degree_issued_date') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [degree_issued_date] DATE NULL; -- ngày cấp bằng
GO
IF COL_LENGTH(N'dbo.trainees', N'legacy_code') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [legacy_code] NVARCHAR(30) NULL; -- mã học viên trong sổ cũ
GO

PRINT N'✅ Migration 2026-11-10_enrollment_programs hoàn tất.';
GO
