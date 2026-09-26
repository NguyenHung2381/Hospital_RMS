/* ============================================================================
 * Bài học (program_lessons) & tài liệu riêng của bài học (lesson_documents)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Người dùng yêu cầu: mỗi chương trình đào tạo (training_programs) có thể
 *   có nhiều "bài học" — đây là KHUNG NỘI DUNG theo thứ tự (giáo trình khung),
 *   khác hẳn với class_sessions (lịch học cụ thể của 1 khóa học, có ngày/giờ/
 *   phòng — xem 2026-09-11_training_operations.sql). "Bài học" thuộc về
 *   chương trình đào tạo (khung, tái sử dụng được cho nhiều khóa), không
 *   thuộc về khóa học (courses).
 *
 *   Mỗi bài học có tài liệu riêng (lesson_documents), mirror course_documents
 *   nhưng bỏ doc_type/exam_type (bài học chỉ có tài liệu, không có khái niệm
 *   bài kiểm tra — điều đó vẫn thuộc course_documents ở cấp khóa học).
 *
 *   Tài liệu hỗ trợ 2 hình thức: upload file (kể cả video, xem giới hạn dung
 *   lượng mới ở uploadTraining.js) hoặc dán link ngoài — source_type +
 *   file_id/external_url loại trừ nhau qua CHECK, cùng ý tưởng áp dụng cho
 *   course_documents ở migration 2026-09-17_course_documents_link_support.
 *
 *   entity_type mới cho training_files: 'lesson_document' (tách khỏi
 *   'course_document' để không lẫn không gian id giữa 2 bảng con).
 *
 *   display_order là số nhập tay (giống training_programs.display_order),
 *   không cần kéo-thả.
 *
 *   Không thêm permission mới — dùng lại training_programs:read/update.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Bài học của chương trình đào tạo
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.program_lessons', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[program_lessons] (
        [id]            VARCHAR(20)   NOT NULL PRIMARY KEY,
        [program_id]    VARCHAR(20)   NOT NULL,
        [title]         NVARCHAR(255) NOT NULL,
        [description]   NVARCHAR(MAX) NULL,
        [display_order] INT           NOT NULL CONSTRAINT DF_program_lessons_display_order DEFAULT (0),
        [created_at]    DATETIME      NOT NULL CONSTRAINT DF_program_lessons_created_at DEFAULT (GETDATE()),
        [created_by]    VARCHAR(20)   NULL,
        [updated_at]    DATETIME      NULL,
        [updated_by]    VARCHAR(20)   NULL,
        CONSTRAINT FK_plesson_program FOREIGN KEY ([program_id]) REFERENCES [dbo].[training_programs] ([id]) ON DELETE CASCADE
    );
    CREATE NONCLUSTERED INDEX [IX_program_lessons_program] ON [dbo].[program_lessons] ([program_id]);
END
GO

------------------------------------------------------------------------------
-- 2. Tài liệu riêng của bài học (file hoặc link, loại trừ nhau)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.lesson_documents', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[lesson_documents] (
        [id]             VARCHAR(20)   NOT NULL PRIMARY KEY,
        [lesson_id]      VARCHAR(20)   NOT NULL,
        [title]          NVARCHAR(255) NOT NULL,
        [source_type]    VARCHAR(10)   NOT NULL CONSTRAINT DF_lesson_documents_source_type DEFAULT ('file'),
        [file_id]        VARCHAR(20)   NULL,
        [external_url]   NVARCHAR(500) NULL,
        [is_public]      BIT           NOT NULL CONSTRAINT DF_lesson_documents_is_public DEFAULT (1),
        [download_count] INT           NOT NULL CONSTRAINT DF_lesson_documents_download_count DEFAULT (0),
        [created_at]     DATETIME      NOT NULL CONSTRAINT DF_lesson_documents_created_at DEFAULT (GETDATE()),
        [created_by]     VARCHAR(20)   NULL,
        CONSTRAINT FK_lsndoc_lesson FOREIGN KEY ([lesson_id]) REFERENCES [dbo].[program_lessons] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_lsndoc_file   FOREIGN KEY ([file_id])   REFERENCES [dbo].[training_files]    ([id]),
        CONSTRAINT CHK_lsndoc_source_type CHECK ([source_type] IN ('file','link')),
        CONSTRAINT CHK_lsndoc_source_pair CHECK (
            ([source_type] = 'file' AND [file_id] IS NOT NULL AND [external_url] IS NULL) OR
            ([source_type] = 'link' AND [external_url] IS NOT NULL AND [file_id] IS NULL)
        )
    );
    CREATE NONCLUSTERED INDEX [IX_lesson_documents_lesson] ON [dbo].[lesson_documents] ([lesson_id]);
END
GO

PRINT N'✅ Migration 2026-09-17_program_lessons hoàn tất.';
GO
