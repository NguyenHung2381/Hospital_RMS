/* ============================================================================
 * Hỗ trợ tài liệu khóa học dạng link ngoài (bên cạnh upload file)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Người dùng yêu cầu tài liệu khóa học (course_documents) hỗ trợ 3 hình
 *   thức: upload file, upload video, hoặc dán link ngoài (không upload file).
 *   Video xử lý bằng cách nâng giới hạn dung lượng ở uploadTraining.js (xem
 *   TRAINING_MEDIA_MAX_MB), không cần đổi schema riêng cho video.
 *
 *   Thêm source_type ('file'|'link') + external_url; nới file_id từ NOT NULL
 *   sang NULL (khi source_type='link' thì không có file). CHECK đảm bảo đúng
 *   1 trong 2 (file_id hoặc external_url) được set — cùng ý tưởng với
 *   lesson_documents (2026-09-17_program_lessons.sql).
 *
 *   Dữ liệu cũ: ALTER TABLE ADD ... DEFAULT ('file') tự backfill mọi dòng
 *   hiện có với source_type='file' (đã có file_id sẵn) — an toàn cho CHECK.
 *
 *   Không thêm permission mới — dùng lại courses:read/update.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Nới file_id: NOT NULL -> NULL (tài liệu dạng link không có file)
------------------------------------------------------------------------------
IF COLUMNPROPERTY(OBJECT_ID('dbo.course_documents'), 'file_id', 'AllowsNull') = 0
BEGIN
    ALTER TABLE [dbo].[course_documents] ALTER COLUMN [file_id] VARCHAR(20) NULL;
END
GO

------------------------------------------------------------------------------
-- 2. Thêm source_type + external_url
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.course_documents', 'source_type') IS NULL
    ALTER TABLE [dbo].[course_documents] ADD [source_type] VARCHAR(10) NOT NULL
        CONSTRAINT DF_course_documents_source_type DEFAULT ('file');
GO
IF COL_LENGTH('dbo.course_documents', 'external_url') IS NULL
    ALTER TABLE [dbo].[course_documents] ADD [external_url] NVARCHAR(500) NULL;
GO

------------------------------------------------------------------------------
-- 3. CHECK: source_type hợp lệ + file_id/external_url loại trừ nhau
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_course_documents_source_type' AND parent_object_id = OBJECT_ID(N'dbo.course_documents'))
    ALTER TABLE [dbo].[course_documents] WITH CHECK
        ADD CONSTRAINT [CHK_course_documents_source_type] CHECK ([source_type] IN ('file','link'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_course_documents_source_pair' AND parent_object_id = OBJECT_ID(N'dbo.course_documents'))
    ALTER TABLE [dbo].[course_documents] WITH CHECK
        ADD CONSTRAINT [CHK_course_documents_source_pair] CHECK (
            ([source_type] = 'file' AND [file_id] IS NOT NULL AND [external_url] IS NULL) OR
            ([source_type] = 'link' AND [external_url] IS NOT NULL AND [file_id] IS NULL)
        );
GO

PRINT N'✅ Migration 2026-09-17_course_documents_link_support hoàn tất.';
GO
