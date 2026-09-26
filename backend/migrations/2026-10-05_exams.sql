/* ============================================================================
 * Ngân hàng câu hỏi & thi online — Giai đoạn D9 (phụ thuộc D0)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Lớn nhất Giai đoạn D. Đề thi gồm câu trắc nghiệm (auto-chấm ngay khi nộp)
 *   + câu tự luận (chấm tay), theo đúng lựa chọn của người dùng ("cả trắc
 *   nghiệm + tự luận kết hợp trong CÙNG 1 đề"). Học viên làm bài qua tài
 *   khoản đã có (D0) — 1 lượt làm / đề (UNIQUE paper_id+enrollment_id, không
 *   hỗ trợ làm lại ở v1). Khi chấm xong toàn bộ câu (không còn score_awarded
 *   NULL) → đổ điểm vào `grades` qua `courseService.upsertGrade` có sẵn,
 *   KHÔNG tạo cơ chế tính điểm riêng.
 *
 *   options/selected_option lưu dạng JSON text (mirror surveys) — question_bank
 *   dùng chung cho nhiều đề thi (N:N qua exam_paper_questions), không thuộc
 *   riêng 1 khóa học nào.
 *
 *   Không thêm permission mới: quản lý ngân hàng câu hỏi + đề thi + chấm bài
 *   dùng lại 'courses:update' (gắn với khóa học, giống cách quản lý tài liệu/
 *   điểm hiện có); làm bài thi chỉ cần đăng nhập + có ghi danh (enrollment)
 *   hợp lệ vào khóa học của đề thi đó.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Ngân hàng câu hỏi (dùng chung nhiều đề thi)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.question_bank', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[question_bank] (
        [id]             VARCHAR(20)   NOT NULL PRIMARY KEY,
        [subject_id]     VARCHAR(20)   NULL,
        [question_type]  VARCHAR(20)   NOT NULL,
        [question_text]  NVARCHAR(MAX) NOT NULL,
        [options]        NVARCHAR(MAX) NULL,
        [correct_option] NVARCHAR(255) NULL,
        [points]         DECIMAL(4,1)  NOT NULL CONSTRAINT DF_question_bank_points DEFAULT (1),
        [created_at]     DATETIME      NOT NULL CONSTRAINT DF_question_bank_created_at DEFAULT (GETDATE()),
        [created_by]     VARCHAR(20)   NULL,
        [updated_at]     DATETIME      NULL,
        [updated_by]     VARCHAR(20)   NULL,
        CONSTRAINT FK_qbank_subject FOREIGN KEY ([subject_id]) REFERENCES [dbo].[subjects] ([id]),
        CONSTRAINT CHK_qbank_type CHECK ([question_type] IN ('single_choice', 'essay'))
    );
    CREATE NONCLUSTERED INDEX [IX_question_bank_subject] ON [dbo].[question_bank] ([subject_id]);
END
GO

------------------------------------------------------------------------------
-- 2. Đề thi (gắn với 1 khóa học)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.exam_papers', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[exam_papers] (
        [id]               VARCHAR(20)   NOT NULL PRIMARY KEY,
        [course_id]        VARCHAR(20)   NOT NULL,
        [subject_id]       VARCHAR(20)   NULL,
        [title]            NVARCHAR(255) NOT NULL,
        [duration_minutes] INT           NOT NULL CONSTRAINT DF_exam_papers_duration DEFAULT (45),
        [status]           VARCHAR(20)   NOT NULL CONSTRAINT DF_exam_papers_status DEFAULT ('draft'),
        [created_at]       DATETIME      NOT NULL CONSTRAINT DF_exam_papers_created_at DEFAULT (GETDATE()),
        [created_by]       VARCHAR(20)   NULL,
        [updated_at]       DATETIME      NULL,
        [updated_by]       VARCHAR(20)   NULL,
        CONSTRAINT FK_exampaper_course FOREIGN KEY ([course_id]) REFERENCES [dbo].[courses] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_exampaper_subject FOREIGN KEY ([subject_id]) REFERENCES [dbo].[subjects] ([id]),
        CONSTRAINT CHK_exampapers_status CHECK ([status] IN ('draft', 'published', 'closed'))
    );
    CREATE NONCLUSTERED INDEX [IX_exam_papers_course] ON [dbo].[exam_papers] ([course_id]);
END
GO

------------------------------------------------------------------------------
-- 3. Câu hỏi trong đề (N:N question_bank <-> exam_papers, có thứ tự)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.exam_paper_questions', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[exam_paper_questions] (
        [id]          VARCHAR(20) NOT NULL PRIMARY KEY,
        [paper_id]    VARCHAR(20) NOT NULL,
        [question_id] VARCHAR(20) NOT NULL,
        [sort_order]  INT         NOT NULL CONSTRAINT DF_exam_paper_questions_order DEFAULT (0),
        CONSTRAINT FK_epq_paper    FOREIGN KEY ([paper_id])    REFERENCES [dbo].[exam_papers]   ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_epq_question FOREIGN KEY ([question_id]) REFERENCES [dbo].[question_bank] ([id]),
        CONSTRAINT UQ_epq_paper_question UNIQUE ([paper_id], [question_id])
    );
    CREATE NONCLUSTERED INDEX [IX_exam_paper_questions_paper] ON [dbo].[exam_paper_questions] ([paper_id]);
END
GO

------------------------------------------------------------------------------
-- 4. Lượt làm bài — 1 học viên làm tối đa 1 lần / đề (v1, không hỗ trợ làm lại)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.exam_attempts', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[exam_attempts] (
        [id]            VARCHAR(20) NOT NULL PRIMARY KEY,
        [paper_id]      VARCHAR(20) NOT NULL,
        [enrollment_id] VARCHAR(20) NOT NULL,
        [started_at]    DATETIME    NOT NULL CONSTRAINT DF_exam_attempts_started_at DEFAULT (GETDATE()),
        [submitted_at]  DATETIME    NULL,
        [auto_score]    DECIMAL(6,2) NULL,
        [manual_score]  DECIMAL(6,2) NULL,
        [status]        VARCHAR(20) NOT NULL CONSTRAINT DF_exam_attempts_status DEFAULT ('in_progress'),
        CONSTRAINT FK_examatt_paper      FOREIGN KEY ([paper_id])      REFERENCES [dbo].[exam_papers]        ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_examatt_enrollment FOREIGN KEY ([enrollment_id]) REFERENCES [dbo].[course_enrollments] ([id]),
        CONSTRAINT UQ_examatt_paper_enrollment UNIQUE ([paper_id], [enrollment_id]),
        CONSTRAINT CHK_examatt_status CHECK ([status] IN ('in_progress', 'submitted', 'graded'))
    );
    CREATE NONCLUSTERED INDEX [IX_exam_attempts_paper] ON [dbo].[exam_attempts] ([paper_id]);
END
GO

------------------------------------------------------------------------------
-- 5. Câu trả lời từng câu hỏi trong 1 lượt làm bài
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.exam_answers', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[exam_answers] (
        [id]              VARCHAR(20)   NOT NULL PRIMARY KEY,
        [attempt_id]      VARCHAR(20)   NOT NULL,
        [question_id]     VARCHAR(20)   NOT NULL,
        [selected_option] NVARCHAR(255) NULL,
        [essay_text]      NVARCHAR(MAX) NULL,
        [score_awarded]   DECIMAL(4,1)  NULL,
        CONSTRAINT FK_examans_attempt  FOREIGN KEY ([attempt_id])  REFERENCES [dbo].[exam_attempts] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_examans_question FOREIGN KEY ([question_id]) REFERENCES [dbo].[question_bank] ([id]),
        CONSTRAINT UQ_examans_attempt_question UNIQUE ([attempt_id], [question_id])
    );
    CREATE NONCLUSTERED INDEX [IX_exam_answers_attempt] ON [dbo].[exam_answers] ([attempt_id]);
END
GO

PRINT N'✅ Migration 2026-10-05_exams hoàn tất.';
GO
