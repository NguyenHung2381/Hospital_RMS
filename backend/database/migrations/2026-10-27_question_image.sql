/* Ảnh minh hoạ cho câu hỏi trong ngân hàng câu hỏi (đề kiểm tra Đào tạo).
 *   question_bank.image_url: đường dẫn "/uploads/questions/<file>" — NULL = câu
 *   không có hình. Ảnh tải lên qua POST /exams/questions/image.
 *   (Bài test hội nghị lưu ảnh ngay trong JSON seminars.test_questions —
 *   trường "image" — nên không cần cột mới.)
 * Server tự chạy bước này lúc khởi động (permissions/migrations.js). Idempotent. */
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.question_bank', N'U') IS NOT NULL AND COL_LENGTH('dbo.question_bank', 'image_url') IS NULL
    ALTER TABLE [dbo].[question_bank] ADD [image_url] NVARCHAR(500) NULL;
GO

PRINT N'✅ Migration 2026-10-27_question_image hoàn tất.';
GO
