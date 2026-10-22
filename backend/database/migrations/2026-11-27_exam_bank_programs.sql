/* ============================================================================
 * Ngân hàng câu hỏi theo chương trình + sinh đề ngẫu nhiên + kiểm tra đầu vào
 * ----------------------------------------------------------------------------
 * Xem docs/ke-hoach-nang-cap-dao-tao.md, mục "Điều chỉnh 2026-10-22".
 *
 * question_bank.program_id / pool : mỗi chương trình 1 ngân hàng riêng, chia 2 kho
 *     'entrance' (kiểm tra đầu vào) / 'final' (thi cuối khóa). Câu cũ gắn bài học
 *     (subject_id) được CHÉP sang mọi chương trình chứa bài đó (mỗi chương trình 1 bản);
 *     câu chưa gắn bài để program_id NULL (giao diện cho chuyển vào chương trình).
 * exam_papers.purpose / program_id : đề đầu vào (chỉ tham khảo) hay cuối khóa; đề của
 *     lớp nào (chương trình trong khóa).
 * exam_papers.gen_mc_count / gen_essay_count / code_mode / code_count : bốc ngẫu nhiên
 *     N câu từ ngân hàng; code_mode 'per_trainee' (mỗi HV 1 đề) | 'shuffled' (chung đề,
 *     trộn thứ tự) | 'codes' (vài mã đề). NULL = chọn câu tay như trước.
 * exam_papers.weight : trọng số của đề trong điểm lý thuyết (TN × a% + TL × b%).
 * exam_paper_questions.code_no : câu thuộc mã đề nào (đề 'codes').
 * exam_attempts.question_ids / code_no / attempt_no / score10 : bộ câu riêng của lượt
 *     làm bài (theo thứ tự), mã đề được chia, lần thi (thi lại = lượt mới, đề mới) và
 *     điểm quy về thang 10.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.question_bank', N'program_id') IS NULL
    ALTER TABLE [dbo].[question_bank] ADD
        [program_id] VARCHAR(20) NULL CONSTRAINT FK_qbank_program REFERENCES [dbo].[training_programs] ([id]),
        [pool]       VARCHAR(10) NOT NULL CONSTRAINT DF_qbank_pool DEFAULT ('final');
GO
IF OBJECT_ID(N'dbo.CHK_qbank_pool', N'C') IS NULL
    ALTER TABLE [dbo].[question_bank] ADD CONSTRAINT CHK_qbank_pool CHECK ([pool] IN ('entrance', 'final'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_question_bank_program' AND object_id = OBJECT_ID(N'dbo.question_bank'))
    CREATE NONCLUSTERED INDEX [IX_question_bank_program] ON [dbo].[question_bank] ([program_id], [pool]);
GO
-- Câu gắn bài học: bản gốc lấy chương trình đầu tiên chứa bài, các chương trình còn lại nhận
-- bản chép. Chỉ chạy 1 lần (khi chưa câu nào có chương trình).
IF NOT EXISTS (SELECT 1 FROM question_bank WHERE program_id IS NOT NULL)
   AND EXISTS (SELECT 1 FROM question_bank WHERE subject_id IS NOT NULL)
BEGIN
    SELECT q.id AS question_id, l.program_id,
           ROW_NUMBER() OVER (PARTITION BY q.id ORDER BY l.display_order, l.program_id) AS rn
    INTO #qp
    FROM question_bank q JOIN lesson_programs l ON l.lesson_id = q.subject_id;

    UPDATE q SET program_id = x.program_id
    FROM question_bank q JOIN #qp x ON x.question_id = q.id AND x.rn = 1;

    INSERT INTO question_bank (id, subject_id, question_type, question_text, options, correct_option, points,
                               image_url, program_id, pool, created_at, created_by)
    SELECT 'QB' + LEFT(REPLACE(NEWID(), '-', ''), 18), q.subject_id, q.question_type, q.question_text,
           q.options, q.correct_option, q.points, q.image_url, x.program_id, 'final', GETDATE(), q.created_by
    FROM question_bank q JOIN #qp x ON x.question_id = q.id AND x.rn > 1;
    DROP TABLE #qp;
END
GO

IF COL_LENGTH(N'dbo.exam_papers', N'purpose') IS NULL
    ALTER TABLE [dbo].[exam_papers] ADD
        [purpose]         VARCHAR(10)  NOT NULL CONSTRAINT DF_exam_papers_purpose DEFAULT ('final'),
        [program_id]      VARCHAR(20)  NULL CONSTRAINT FK_exam_papers_program REFERENCES [dbo].[training_programs] ([id]),
        [gen_mc_count]    INT          NULL,
        [gen_essay_count] INT          NULL,
        [code_mode]       VARCHAR(12)  NULL,
        [code_count]      INT          NULL,
        [weight]          DECIMAL(5,2) NULL;
GO
IF OBJECT_ID(N'dbo.CHK_exam_papers_purpose', N'C') IS NULL
    ALTER TABLE [dbo].[exam_papers] ADD CONSTRAINT CHK_exam_papers_purpose CHECK ([purpose] IN ('entrance', 'final'));
GO
IF OBJECT_ID(N'dbo.CHK_exam_papers_code_mode', N'C') IS NULL
    ALTER TABLE [dbo].[exam_papers] ADD CONSTRAINT CHK_exam_papers_code_mode
        CHECK ([code_mode] IS NULL OR [code_mode] IN ('per_trainee', 'shuffled', 'codes'));
GO

-- 1 câu có thể nằm ở nhiều mã đề của cùng 1 đề
IF COL_LENGTH(N'dbo.exam_paper_questions', N'code_no') IS NULL
    ALTER TABLE [dbo].[exam_paper_questions] ADD [code_no] INT NULL;
GO
IF OBJECT_ID(N'dbo.UQ_epq_paper_question', N'UQ') IS NOT NULL
    ALTER TABLE [dbo].[exam_paper_questions] DROP CONSTRAINT [UQ_epq_paper_question];
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_epq_paper_code_question' AND object_id = OBJECT_ID(N'dbo.exam_paper_questions'))
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_epq_paper_code_question]
        ON [dbo].[exam_paper_questions] ([paper_id], [code_no], [question_id]);
GO

-- Thi lại = lượt làm bài mới trên cùng đề
IF COL_LENGTH(N'dbo.exam_attempts', N'attempt_no') IS NULL
    ALTER TABLE [dbo].[exam_attempts] ADD
        [attempt_no]   INT           NOT NULL CONSTRAINT DF_exam_attempts_attempt_no DEFAULT (1),
        [code_no]      INT           NULL,
        [question_ids] NVARCHAR(MAX) NULL,
        [score10]      DECIMAL(4,1)  NULL;
GO
IF OBJECT_ID(N'dbo.UQ_examatt_paper_enrollment', N'UQ') IS NOT NULL
    ALTER TABLE [dbo].[exam_attempts] DROP CONSTRAINT [UQ_examatt_paper_enrollment];
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_examatt_paper_enrollment_no' AND object_id = OBJECT_ID(N'dbo.exam_attempts'))
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_examatt_paper_enrollment_no]
        ON [dbo].[exam_attempts] ([paper_id], [enrollment_id], [attempt_no]);
GO

PRINT N'✅ Migration 2026-11-27_exam_bank_programs hoàn tất.';
GO
