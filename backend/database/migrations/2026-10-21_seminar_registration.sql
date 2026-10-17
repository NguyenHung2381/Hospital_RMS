/* ============================================================================
 * Hội nghị: đăng ký qua QR → vé QR điểm danh → bài test cuối buổi → CME
 * ----------------------------------------------------------------------------
 *   seminars.public_token    : mã ngẫu nhiên trong link/QR đăng ký công khai
 *                              (/hoi-nghi/<token>) — sinh khi tạo hội nghị.
 *   seminars.test_questions  : JSON [{ q, options: [..], answer: <index> }]
 *   seminars.test_open       : ban tổ chức mở bài test (cuối buổi)
 *   seminar_participants.ticket_code : mã vé cá nhân (QR người tham dự lưu
 *                              về máy) — chỉ có ở người tự đăng ký qua QR.
 *   phone / email            : liên hệ người tự đăng ký.
 *   test_*                   : kết quả bài test (1 lần nộp).
 *   Người có ticket_code chỉ được cấp CME khi đã điểm danh + nộp bài test
 *   (seminarParticipantService.issueCme).
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.seminars', N'public_token') IS NULL
    ALTER TABLE [dbo].[seminars] ADD [public_token] VARCHAR(32) NULL;
GO
IF COL_LENGTH(N'dbo.seminars', N'test_questions') IS NULL
    ALTER TABLE [dbo].[seminars] ADD [test_questions] NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH(N'dbo.seminars', N'test_open') IS NULL
    ALTER TABLE [dbo].[seminars] ADD [test_open] BIT NOT NULL CONSTRAINT DF_seminars_test_open DEFAULT (0);
GO
UPDATE [dbo].[seminars]
SET public_token = LOWER(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''))
WHERE public_token IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_seminars_public_token' AND object_id = OBJECT_ID(N'dbo.seminars'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_seminars_public_token ON dbo.seminars (public_token) WHERE public_token IS NOT NULL;
GO

IF COL_LENGTH(N'dbo.seminar_participants', N'ticket_code') IS NULL
    ALTER TABLE [dbo].[seminar_participants] ADD
        [ticket_code]       VARCHAR(32)   NULL,
        [phone]             VARCHAR(20)   NULL,
        [email]             NVARCHAR(255) NULL,
        [test_answers]      NVARCHAR(MAX) NULL,
        [test_correct]      INT           NULL,
        [test_total]        INT           NULL,
        [test_submitted_at] DATETIME      NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_sp_ticket_code' AND object_id = OBJECT_ID(N'dbo.seminar_participants'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_sp_ticket_code ON dbo.seminar_participants (ticket_code) WHERE ticket_code IS NOT NULL;
GO

PRINT N'✅ Migration 2026-10-21_seminar_registration hoàn tất.';
GO
