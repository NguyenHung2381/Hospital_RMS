/* ============================================================================
 * Phân loại bài kiểm tra + đếm lượt tải cho course_documents
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu QLNCKHDTCDT-main: dt_bai_kiem_tra phân loại loai_bkt (Thường
 *   xuyên/Giữa kỳ/Cuối kỳ); dt_tai_lieu có incDownload đếm lượt tải. Ở RMS,
 *   "tài liệu" và "bài kiểm tra" đã gộp 1 khái niệm course_documents
 *   (doc_type: material/test_question/test_answer, xem 2026-09-11_training_
 *   results.sql) — giữ nguyên quyết định gộp đó, chỉ bổ sung 2 cột còn thiếu:
 *   exam_type (chỉ có ý nghĩa khi doc_type là test_question/test_answer) và
 *   download_count.
 *
 *   Không thêm permission mới — dùng lại courses:read/courses:update.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.course_documents', 'download_count') IS NULL
    ALTER TABLE [dbo].[course_documents] ADD [download_count] INT NOT NULL
        CONSTRAINT DF_course_documents_download_count DEFAULT (0);
GO
IF COL_LENGTH('dbo.course_documents', 'exam_type') IS NULL
    ALTER TABLE [dbo].[course_documents] ADD [exam_type] VARCHAR(20) NULL;
GO

PRINT N'✅ Migration 2026-09-16_course_documents_extra hoàn tất.';
GO
