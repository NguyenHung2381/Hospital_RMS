/* ============================================================================
 * 2026-11-20_lecturer_assignment_roles
 * ----------------------------------------------------------------------------
 *   Giai đoạn 5 (docs/ke-hoach-nang-cap-dao-tao.md) — giảng viên theo bài học.
 *   lecturer_assignments.subject_id trỏ program_lessons (giữ tên cột cũ).
 * 1) role ('main' = GV chính | 'assistant' = GV phụ), mặc định 'main'.
 * 2) hours: số tiết GV đảm nhận trong bài (NULL = chưa ghi).
 * 3) Mỗi bài của khóa tối đa 1 GV chính: dữ liệu cũ có nhiều GV cùng 1 bài thì
 *    người phân công sớm nhất giữ 'main', còn lại chuyển 'assistant'.
 * 4) UNIQUE (course_id, subject_id, lecturer_id). Dữ liệu cũ trùng thì bỏ qua
 *    (PRINT cảnh báo) — xoá tay bản trùng rồi chạy migration sau.
 *    subject_id NULL = phân công cả khóa; SQL Server coi các NULL là bằng nhau
 *    nên mỗi GV chỉ có 1 dòng "cả khóa".
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
IF COL_LENGTH(N'dbo.lecturer_assignments', N'role') IS NULL
    ALTER TABLE [dbo].[lecturer_assignments]
        ADD [role] VARCHAR(10) NOT NULL CONSTRAINT DF_lecass_role DEFAULT ('main');
GO
IF COL_LENGTH(N'dbo.lecturer_assignments', N'hours') IS NULL
    ALTER TABLE [dbo].[lecturer_assignments] ADD [hours] INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_lecass_role')
    ALTER TABLE [dbo].[lecturer_assignments]
        ADD CONSTRAINT CHK_lecass_role CHECK ([role] IN ('main', 'assistant'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_lecass_hours')
    ALTER TABLE [dbo].[lecturer_assignments]
        ADD CONSTRAINT CHK_lecass_hours CHECK ([hours] IS NULL OR [hours] >= 0);
GO
-- 3) Mỗi bài 1 GV chính
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_lecass_main' AND object_id = OBJECT_ID(N'dbo.lecturer_assignments'))
BEGIN
    ;WITH ranked AS (
        SELECT [role], ROW_NUMBER() OVER (PARTITION BY course_id, subject_id ORDER BY created_at, id) AS rn
        FROM [dbo].[lecturer_assignments]
        WHERE subject_id IS NOT NULL AND [role] = 'main'
    )
    UPDATE ranked SET [role] = 'assistant' WHERE rn > 1;

    CREATE UNIQUE NONCLUSTERED INDEX [UQ_lecass_main] ON [dbo].[lecturer_assignments] ([course_id], [subject_id])
        WHERE [role] = 'main' AND [subject_id] IS NOT NULL;
END
GO
-- 4) Không phân công trùng 1 GV vào cùng 1 bài của khóa
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_lecass_course_subject_lecturer' AND object_id = OBJECT_ID(N'dbo.lecturer_assignments'))
BEGIN
    IF EXISTS (SELECT 1 FROM [dbo].[lecturer_assignments] GROUP BY course_id, subject_id, lecturer_id HAVING COUNT(*) > 1)
        PRINT N'⚠️  lecturer_assignments có phân công trùng (khóa, bài, GV) — chưa tạo UQ_lecass_course_subject_lecturer.';
    ELSE
        CREATE UNIQUE NONCLUSTERED INDEX [UQ_lecass_course_subject_lecturer]
            ON [dbo].[lecturer_assignments] ([course_id], [subject_id], [lecturer_id]);
END
GO
