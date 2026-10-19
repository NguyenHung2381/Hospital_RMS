/* ============================================================================
 * Đào tạo GĐ1 — Khóa học theo loại (GPHN / ĐTLT…), trường chương trình theo
 * danh mục 1.xlsx, bài học dạng "vòng thực hành" kèm khoa được chọn
 * ----------------------------------------------------------------------------
 * Tài liệu "Xây dựng phần mềm": cây Khóa học → Chương trình → Bài học, với 2
 * loại khóa chính GPHN (thực hành cấp GPHN, mở liên tục, mỗi học viên có lịch
 * riêng) và ĐTLT Đợt X (đào tạo liên tục theo đợt). Xem docs/ke-hoach-sua-dao-tao.md.
 *
 * 1. training_types: thêm ĐTLT / GPHN / CTCV / THBV (chỉ thêm khi chưa có id —
 *    không ghi đè tên người dùng đã sửa, không khôi phục loại đã bị xoá khác).
 * 2. courses: training_type_id (loại khóa), batch_no (số đợt), is_rolling (khóa
 *    mở liên tục — không cần ngày khóa / cửa sổ đăng ký).
 * 3. training_programs: số tiết LT/TH (+ tổng tính sẵn), số giờ tín chỉ, học phí,
 *    thời lượng dạng số (duration_value + duration_unit; cột duration văn bản
 *    giữ để hiển thị), đối tượng dạng văn bản (target_audience — Excel ghi tự
 *    do "Bác sĩ, Điều dưỡng, KTV"), ghi chú khoa phụ trách (department_note —
 *    "Nhiều khoa tùy vòng…" hoặc tên khoa chưa khớp danh mục).
 * 4. program_lessons: lesson_kind (theory | rotation), thời lượng, allow_split
 *    (vòng chia cho nhiều khoa — vòng chuyên khoa lẻ).
 * 5. lesson_departments: các khoa được chọn cho 1 vòng.
 *
 * Idempotent — mỗi bước tự kiểm tra nên chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

------------------------------------------------------------------------------
-- 1. Loại hình đào tạo dùng làm loại khóa
------------------------------------------------------------------------------
MERGE [dbo].[training_types] AS tgt
USING (VALUES
    ('TRNTP-DTLT', N'Đào tạo liên tục (ĐTLT)',            N'Khóa mở theo đợt: ĐTLT Đợt X'),
    ('TRNTP-GPHN', N'Thực hành giấy phép hành nghề (GPHN)', N'Thực hành khám chữa bệnh trước khi cấp GPHN — khóa mở liên tục, mỗi học viên có lịch vòng riêng'),
    ('TRNTP-CTCV', N'Cầm tay chỉ việc (CTCV)',            NULL),
    ('TRNTP-THBV', N'Tập huấn bệnh viện (THBV)',          NULL)
) AS src (id, name, description)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, created_by)
    VALUES (src.id, src.name, src.description, N'SYSTEM');
GO

------------------------------------------------------------------------------
-- 2. Khóa học
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.courses', N'training_type_id') IS NULL
    ALTER TABLE [dbo].[courses] ADD [training_type_id] VARCHAR(20) NULL
        CONSTRAINT FK_courses_training_type REFERENCES [dbo].[training_types] ([id]);
GO
IF COL_LENGTH(N'dbo.courses', N'batch_no') IS NULL
    ALTER TABLE [dbo].[courses] ADD [batch_no] INT NULL; -- "Đợt số X" của khóa ĐTLT
GO
IF COL_LENGTH(N'dbo.courses', N'is_rolling') IS NULL
    ALTER TABLE [dbo].[courses] ADD [is_rolling] BIT NOT NULL
        CONSTRAINT DF_courses_is_rolling DEFAULT (0);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_courses_training_type' AND object_id = OBJECT_ID(N'dbo.courses'))
    CREATE NONCLUSTERED INDEX [IX_courses_training_type] ON [dbo].[courses] ([training_type_id]);
GO

------------------------------------------------------------------------------
-- 3. Chương trình đào tạo
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.training_programs', N'theory_hours') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [theory_hours] INT NULL;
GO
IF COL_LENGTH(N'dbo.training_programs', N'practice_hours') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [practice_hours] INT NULL;
GO
IF COL_LENGTH(N'dbo.training_programs', N'total_hours') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [total_hours] AS (ISNULL([theory_hours], 0) + ISNULL([practice_hours], 0)) PERSISTED;
GO
IF COL_LENGTH(N'dbo.training_programs', N'credit_hours') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [credit_hours] DECIMAL(6, 1) NULL; -- số giờ tín chỉ
GO
IF COL_LENGTH(N'dbo.training_programs', N'tuition_fee') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [tuition_fee] DECIMAL(18, 0) NULL; -- học phí (VNĐ)
GO
IF COL_LENGTH(N'dbo.training_programs', N'duration_value') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [duration_value] DECIMAL(6, 2) NULL;
GO
IF COL_LENGTH(N'dbo.training_programs', N'duration_unit') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [duration_unit] VARCHAR(10) NULL
        CONSTRAINT CHK_trprog_duration_unit CHECK ([duration_unit] IN ('day', 'week', 'month'));
GO
IF COL_LENGTH(N'dbo.training_programs', N'target_audience') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [target_audience] NVARCHAR(300) NULL;
GO
IF COL_LENGTH(N'dbo.training_programs', N'department_note') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [department_note] NVARCHAR(255) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_trprog_training_type' AND object_id = OBJECT_ID(N'dbo.training_programs'))
    CREATE NONCLUSTERED INDEX [IX_trprog_training_type] ON [dbo].[training_programs] ([training_type_id]);
GO
-- Nhập danh mục cập nhật theo mã ⇒ mã không được trùng. Dữ liệu cũ có mã trùng
-- thì bỏ qua (báo lại) thay vì làm hỏng migration — sửa tay rồi chạy migration sau.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_trprog_code' AND object_id = OBJECT_ID(N'dbo.training_programs'))
BEGIN
    IF EXISTS (SELECT code FROM [dbo].[training_programs] WHERE code IS NOT NULL AND code <> '' GROUP BY code HAVING COUNT(*) > 1)
        PRINT N'⚠️  training_programs có mã trùng — chưa tạo UQ_trprog_code.';
    ELSE
    BEGIN
        UPDATE [dbo].[training_programs] SET code = NULL WHERE code = '';
        CREATE UNIQUE NONCLUSTERED INDEX [UQ_trprog_code] ON [dbo].[training_programs] ([code]) WHERE [code] IS NOT NULL;
    END
END
GO

------------------------------------------------------------------------------
-- 4. Bài học / vòng thực hành
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.program_lessons', N'lesson_kind') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [lesson_kind] VARCHAR(10) NOT NULL
        CONSTRAINT DF_program_lessons_kind DEFAULT ('theory')
        CONSTRAINT CHK_program_lessons_kind CHECK ([lesson_kind] IN ('theory', 'rotation'));
GO
IF COL_LENGTH(N'dbo.program_lessons', N'duration_value') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [duration_value] DECIMAL(6, 2) NULL;
GO
IF COL_LENGTH(N'dbo.program_lessons', N'duration_unit') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [duration_unit] VARCHAR(10) NULL
        CONSTRAINT CHK_program_lessons_duration_unit CHECK ([duration_unit] IN ('day', 'week', 'month'));
GO
IF COL_LENGTH(N'dbo.program_lessons', N'allow_split') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [allow_split] BIT NOT NULL
        CONSTRAINT DF_program_lessons_allow_split DEFAULT (0);
GO

------------------------------------------------------------------------------
-- 5. Khoa được chọn cho 1 vòng thực hành
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.lesson_departments', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[lesson_departments] (
        [lesson_id]     VARCHAR(20) NOT NULL,
        [department_id] VARCHAR(20) NOT NULL,
        [display_order] INT         NOT NULL CONSTRAINT DF_lesson_departments_order DEFAULT (0),
        CONSTRAINT PK_lesson_departments PRIMARY KEY ([lesson_id], [department_id]),
        CONSTRAINT FK_lsndept_lesson     FOREIGN KEY ([lesson_id])     REFERENCES [dbo].[program_lessons] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_lsndept_department FOREIGN KEY ([department_id]) REFERENCES [dbo].[departments]     ([id]) ON DELETE CASCADE
    );
    CREATE NONCLUSTERED INDEX [IX_lesson_departments_department] ON [dbo].[lesson_departments] ([department_id]);
END
GO

PRINT N'✅ Migration 2026-11-07_training_course_types_rotations hoàn tất.';
GO
