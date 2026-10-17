/* Xoá học viên = ẩn khỏi danh sách (trainees.hidden_at). Idempotent. */
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.trainees', N'hidden_at') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [hidden_at] DATETIME2 NULL;
GO
