/* ============================================================================
 * Loại đề thi: trắc nghiệm / tự luận
 * ----------------------------------------------------------------------------
 *   exam_papers.paper_type: 'multiple_choice' (chỉ câu single_choice) hoặc
 *   'essay' (chỉ câu tự luận). NULL = đề tạo trước migration này (hỗn hợp) —
 *   service không lọc loại câu cho các đề đó.
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.exam_papers', N'U') IS NOT NULL AND COL_LENGTH('exam_papers', 'paper_type') IS NULL
BEGIN
    ALTER TABLE [dbo].[exam_papers] ADD [paper_type] VARCHAR(20) NULL
        CONSTRAINT CHK_exampapers_type CHECK ([paper_type] IN ('multiple_choice', 'essay'));
END
GO

PRINT N'✅ Migration 2026-10-19_exam_paper_type hoàn tất.';
GO
