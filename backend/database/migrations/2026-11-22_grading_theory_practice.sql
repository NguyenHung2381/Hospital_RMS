/* ============================================================================
 * 2026-11-22_grading_theory_practice
 * ----------------------------------------------------------------------------
 *   Giai đoạn 4 (docs/ke-hoach-nang-cap-dao-tao.md) — chấm điểm 2 phần Lý thuyết
 *   + Thực hành theo Phụ lục III TT 32/2023/TT-BYT, bỏ TX/GK/CK.
 * 1) grades: theory_score / practice_score (thang 10, 1 chữ số thập phân),
 *    theory_flag / practice_flag ('absent' = vắng thi | 'exempt' = miễn thi),
 *    theory_attempt / practice_attempt (lần thi, 1 = lần đầu), locked_at / locked_by.
 *    Cột regular/midterm/final_score giữ để đọc dữ liệu cũ.
 * 2) grade_history: lịch sử từng lần ghi điểm (thi lại, sửa sau khi mở khóa).
 * 3) exam_papers.exam_part ('theory' | 'practice'), blind_grading (ẩn tên khi chấm).
 * 4) exam_paper_graders: người chấm của đề (GV). Đề chưa có dòng nào thì người
 *    chấm mặc định = GV được phân công bài học của đề.
 * 5) class_sessions.session_kind ('theory' | 'practice', NULL = suy ra từ loại bài
 *    học: vòng thực hành = practice, còn lại = theory) — để tính chuyên cần LT/TH.
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

-- 1) grades
IF COL_LENGTH(N'dbo.grades', N'theory_score') IS NULL
    ALTER TABLE [dbo].[grades] ADD
        [theory_score]     DECIMAL(4, 1) NULL,
        [practice_score]   DECIMAL(4, 1) NULL,
        [theory_flag]      VARCHAR(10)   NULL,
        [practice_flag]    VARCHAR(10)   NULL,
        [theory_attempt]   INT           NOT NULL CONSTRAINT DF_grades_theory_attempt DEFAULT (1),
        [practice_attempt] INT           NOT NULL CONSTRAINT DF_grades_practice_attempt DEFAULT (1),
        [locked_at]        DATETIME      NULL,
        [locked_by]        VARCHAR(20)   NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_grades_part_scores')
    ALTER TABLE [dbo].[grades] ADD CONSTRAINT CHK_grades_part_scores CHECK (
        ([theory_score] IS NULL OR [theory_score] BETWEEN 0 AND 10)
        AND ([practice_score] IS NULL OR [practice_score] BETWEEN 0 AND 10));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_grades_part_flags')
    ALTER TABLE [dbo].[grades] ADD CONSTRAINT CHK_grades_part_flags CHECK (
        ([theory_flag] IS NULL OR [theory_flag] IN ('absent', 'exempt'))
        AND ([practice_flag] IS NULL OR [practice_flag] IN ('absent', 'exempt')));
GO
-- Mỗi lượt ghi danh 1 dòng điểm tổng khóa (subject_id NULL). Dữ liệu cũ trùng thì bỏ qua.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_grades_enrollment_course' AND object_id = OBJECT_ID(N'dbo.grades'))
BEGIN
    IF EXISTS (SELECT 1 FROM [dbo].[grades] WHERE subject_id IS NULL GROUP BY enrollment_id HAVING COUNT(*) > 1)
        PRINT N'⚠️  grades có nhiều dòng điểm tổng khóa cho 1 lượt ghi danh — chưa tạo UQ_grades_enrollment_course.';
    ELSE
        CREATE UNIQUE NONCLUSTERED INDEX [UQ_grades_enrollment_course] ON [dbo].[grades] ([enrollment_id])
            WHERE [subject_id] IS NULL;
END
GO

-- 2) Lịch sử điểm
IF OBJECT_ID(N'dbo.grade_history', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[grade_history] (
        [id]            BIGINT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
        [enrollment_id] VARCHAR(20)    NOT NULL,
        [part]          VARCHAR(10)    NOT NULL, -- 'theory' | 'practice'
        [attempt_no]    INT            NOT NULL,
        [score]         DECIMAL(4, 1)  NULL,
        [flag]          VARCHAR(10)    NULL,
        [source]        VARCHAR(20)    NOT NULL, -- 'manual' | 'exam' | 'import' | 'retake'
        [note]          NVARCHAR(255)  NULL,
        [changed_at]    DATETIME       NOT NULL CONSTRAINT DF_grade_history_changed_at DEFAULT (GETDATE()),
        [changed_by]    VARCHAR(20)    NULL,
        CONSTRAINT FK_grade_history_enrollment FOREIGN KEY ([enrollment_id]) REFERENCES [dbo].[course_enrollments] ([id]) ON DELETE CASCADE,
        CONSTRAINT CHK_grade_history_part CHECK ([part] IN ('theory', 'practice'))
    );
    CREATE NONCLUSTERED INDEX [IX_grade_history_enrollment] ON [dbo].[grade_history] ([enrollment_id], [changed_at]);
END
GO

-- 3) Đề thi thuộc phần nào
IF COL_LENGTH(N'dbo.exam_papers', N'exam_part') IS NULL
    ALTER TABLE [dbo].[exam_papers] ADD
        [exam_part] VARCHAR(10) NOT NULL CONSTRAINT DF_exam_papers_exam_part DEFAULT ('theory'),
        [blind_grading] BIT NOT NULL CONSTRAINT DF_exam_papers_blind_grading DEFAULT (0);
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_exam_papers_part')
    ALTER TABLE [dbo].[exam_papers] ADD CONSTRAINT CHK_exam_papers_part CHECK ([exam_part] IN ('theory', 'practice'));
GO

-- 4) Người chấm của đề
IF OBJECT_ID(N'dbo.exam_paper_graders', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[exam_paper_graders] (
        [paper_id]    VARCHAR(20) NOT NULL,
        [lecturer_id] VARCHAR(20) NOT NULL,
        [created_at]  DATETIME    NOT NULL CONSTRAINT DF_exam_paper_graders_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20) NULL,
        CONSTRAINT PK_exam_paper_graders PRIMARY KEY ([paper_id], [lecturer_id]),
        CONSTRAINT FK_exam_paper_graders_paper FOREIGN KEY ([paper_id]) REFERENCES [dbo].[exam_papers] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_exam_paper_graders_lecturer FOREIGN KEY ([lecturer_id]) REFERENCES [dbo].[lecturers] ([id])
    );
END
GO

-- 5) Buổi lý thuyết / thực hành
IF COL_LENGTH(N'dbo.class_sessions', N'session_kind') IS NULL
    ALTER TABLE [dbo].[class_sessions] ADD [session_kind] VARCHAR(10) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_class_sessions_kind')
    ALTER TABLE [dbo].[class_sessions] ADD CONSTRAINT CHK_class_sessions_kind
        CHECK ([session_kind] IS NULL OR [session_kind] IN ('theory', 'practice'));
GO

PRINT N'✅ Migration 2026-11-22_grading_theory_practice hoàn tất.';
GO
