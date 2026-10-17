/* ============================================================================
 * Hội nghị: cấu hình bài test cuối buổi
 * ----------------------------------------------------------------------------
 *   seminars.test_end_date          : ngày dừng tiếp nhận bài (trống = ngày mở bài)
 *   seminars.test_duration_minutes  : thời gian làm bài (phút) tính từ lúc người
 *                                     làm bấm "Bắt đầu" — trống = không giới hạn
 *   seminars.test_pass_score        : điểm đạt để được cấp CME — trống = chỉ cần nộp
 *   seminars.test_shuffle_questions / test_shuffle_options : trộn thứ tự câu hỏi /
 *                                     phương án theo từng vé
 *   seminar_participants.test_started_at : lúc bấm "Bắt đầu làm bài"
 *   seminar_participants.test_score / test_max_score : điểm theo trọng số từng câu
 *   Điểm từng câu nằm trong JSON seminars.test_questions ({ ..., points }).
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.seminars', N'test_end_date') IS NULL
    ALTER TABLE [dbo].[seminars] ADD [test_end_date] DATE NULL,
        [test_duration_minutes] INT NULL, [test_pass_score] DECIMAL(7, 2) NULL,
        [test_shuffle_questions] BIT NOT NULL CONSTRAINT [DF_seminars_test_shuffle_q] DEFAULT (0),
        [test_shuffle_options] BIT NOT NULL CONSTRAINT [DF_seminars_test_shuffle_o] DEFAULT (0);
GO
IF COL_LENGTH(N'dbo.seminar_participants', N'test_started_at') IS NULL
    ALTER TABLE [dbo].[seminar_participants] ADD [test_started_at] DATETIME NULL,
        [test_score] DECIMAL(7, 2) NULL, [test_max_score] DECIMAL(7, 2) NULL;
GO

PRINT N'✅ Migration 2026-11-02_seminar_test_settings hoàn tất.';
GO
