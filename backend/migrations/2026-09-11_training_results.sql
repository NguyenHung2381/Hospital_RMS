/* ============================================================================
 * Kết quả, chứng nhận & CME cho Đào tạo (Giai đoạn 5)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   - training_files: kho file DÙNG CHUNG cho toàn domain Đào tạo (hồ sơ học
 *     viên, tài liệu/đề kiểm tra khóa học, file chứng chỉ). Bảng `files` hiện
 *     có của hệ thống bị khoá cứng vào topic_id (chỉ dùng cho NCKH) — không
 *     đụng vào bảng đó để tránh rủi ro cho luồng NCKH đang chạy tốt; Đào tạo
 *     có kho file polymorphic riêng (entity_type/entity_id).
 *   - course_documents GỘP LUÔN "tài liệu khóa học" và "bài kiểm tra" thành 1
 *     khái niệm (doc_type: material/test_question/test_answer) — đối chiếu
 *     bản PHP nguồn, "bài kiểm tra" ở đó cũng chỉ là file đề + đáp án kèm cờ
 *     công khai đáp án (cong_khai_dap_an), KHÔNG có chấm điểm trực tuyến, nên
 *     không cần model riêng phức tạp hơn.
 *   - trainee_documents: hồ sơ học viên (CCCD, bằng cấp...) — hoãn từ Giai
 *     đoạn 3, nay triển khai cùng lúc với hạ tầng file chung.
 *   - KHÔNG thêm quyền (permission) mới: course_documents/grades/certificates
 *     dùng lại quyền 'courses:*' đã có; trainee_documents dùng lại
 *     'trainees:update' + 'trainees:read_sensitive'; cme_requirements dùng
 *     lại 'seminars:cme_manage' đã có sẵn cho toàn bộ nghiệp vụ CME.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Kho file dùng chung cho Đào tạo (polymorphic qua entity_type/entity_id)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.training_files', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[training_files] (
        [id]          VARCHAR(20)   NOT NULL PRIMARY KEY,
        [entity_type] VARCHAR(30)   NOT NULL, -- 'trainee_document' | 'course_document' | 'certificate'
        [entity_id]   VARCHAR(20)   NOT NULL,
        [file_name]   NVARCHAR(255) NOT NULL,
        [file_url]    NVARCHAR(500) NOT NULL,
        [mime_type]   VARCHAR(150)  NULL,
        [file_size]   BIGINT        NULL,
        [is_deleted]  BIT           NOT NULL CONSTRAINT DF_training_files_is_deleted DEFAULT (0),
        [created_at]  DATETIME      NOT NULL CONSTRAINT DF_training_files_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20)   NULL
    );
    CREATE NONCLUSTERED INDEX [IX_training_files_entity] ON [dbo].[training_files] ([entity_type], [entity_id]);
END
GO

------------------------------------------------------------------------------
-- 2. Hồ sơ học viên (hoãn từ Giai đoạn 3)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.trainee_documents', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[trainee_documents] (
        [id]         VARCHAR(20)  NOT NULL PRIMARY KEY,
        [trainee_id] VARCHAR(20)  NOT NULL,
        [doc_type]   VARCHAR(30)  NOT NULL, -- 'national_id' | 'degree' | 'other'
        [file_id]    VARCHAR(20)  NOT NULL,
        [created_at] DATETIME     NOT NULL CONSTRAINT DF_trainee_documents_created_at DEFAULT (GETDATE()),
        [created_by] VARCHAR(20)  NULL,
        CONSTRAINT FK_trndoc_trainee FOREIGN KEY ([trainee_id]) REFERENCES [dbo].[trainees]       ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_trndoc_file    FOREIGN KEY ([file_id])    REFERENCES [dbo].[training_files] ([id])
    );
END
GO

------------------------------------------------------------------------------
-- 3. Tài liệu / bài kiểm tra khóa học (gộp 1 khái niệm — xem giải thích đầu file)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.course_documents', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[course_documents] (
        [id]        VARCHAR(20)   NOT NULL PRIMARY KEY,
        [course_id] VARCHAR(20)   NOT NULL,
        [doc_type]  VARCHAR(20)   NOT NULL CONSTRAINT DF_course_documents_doc_type DEFAULT ('material'),
        [title]     NVARCHAR(255) NOT NULL,
        [file_id]   VARCHAR(20)   NOT NULL,
        [is_public] BIT           NOT NULL CONSTRAINT DF_course_documents_is_public DEFAULT (1),
        [created_at] DATETIME     NOT NULL CONSTRAINT DF_course_documents_created_at DEFAULT (GETDATE()),
        [created_by] VARCHAR(20)  NULL,
        CONSTRAINT FK_crsdoc_course FOREIGN KEY ([course_id]) REFERENCES [dbo].[courses]        ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_crsdoc_file   FOREIGN KEY ([file_id])   REFERENCES [dbo].[training_files] ([id])
    );
END
GO

------------------------------------------------------------------------------
-- 4. Kết quả học tập
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.grades', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[grades] (
        [id]            VARCHAR(20)   NOT NULL PRIMARY KEY,
        [enrollment_id] VARCHAR(20)   NOT NULL,
        [subject_id]    VARCHAR(20)   NULL, -- NULL = điểm/kết quả tổng kết khóa học
        [score]         DECIMAL(5,2)  NULL,
        [result]        VARCHAR(20)   NULL, -- 'pass' | 'fail' | tự do
        [note]          NVARCHAR(255) NULL,
        [created_at]    DATETIME      NOT NULL CONSTRAINT DF_grades_created_at DEFAULT (GETDATE()),
        [created_by]    VARCHAR(20)   NULL,
        [updated_at]    DATETIME      NULL,
        [updated_by]    VARCHAR(20)   NULL,
        CONSTRAINT FK_grades_enrollment FOREIGN KEY ([enrollment_id]) REFERENCES [dbo].[course_enrollments] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_grades_subject    FOREIGN KEY ([subject_id])    REFERENCES [dbo].[subjects]           ([id])
    );
END
GO

------------------------------------------------------------------------------
-- 5. Chứng chỉ — 1 chứng chỉ / lượt đăng ký, số chứng chỉ duy nhất
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.certificates', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[certificates] (
        [id]            VARCHAR(20)  NOT NULL PRIMARY KEY,
        [enrollment_id] VARCHAR(20)  NOT NULL,
        [cert_no]       VARCHAR(30)  NOT NULL,
        [issue_date]    DATE         NOT NULL CONSTRAINT DF_certificates_issue_date DEFAULT (CAST(GETDATE() AS DATE)),
        [file_id]       VARCHAR(20)  NULL,
        [created_at]    DATETIME     NOT NULL CONSTRAINT DF_certificates_created_at DEFAULT (GETDATE()),
        [created_by]    VARCHAR(20)  NULL,
        CONSTRAINT FK_cert_enrollment FOREIGN KEY ([enrollment_id]) REFERENCES [dbo].[course_enrollments] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_cert_file       FOREIGN KEY ([file_id])       REFERENCES [dbo].[training_files]     ([id]),
        CONSTRAINT UQ_cert_enrollment UNIQUE ([enrollment_id]),
        CONSTRAINT UQ_cert_no UNIQUE ([cert_no])
    );
END
GO

------------------------------------------------------------------------------
-- 6. Ngưỡng tín chỉ CME theo năm (toàn viện hoặc theo khoa/phòng)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.cme_requirements', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[cme_requirements] (
        [id]                VARCHAR(20)  NOT NULL PRIMARY KEY,
        [year]              INT          NOT NULL,
        [required_credits]  DECIMAL(6,2) NOT NULL,
        [department_id]     VARCHAR(20)  NULL, -- NULL = áp dụng toàn viện
        [note]              NVARCHAR(255) NULL,
        [created_at]        DATETIME     NOT NULL CONSTRAINT DF_cme_requirements_created_at DEFAULT (GETDATE()),
        [created_by]        VARCHAR(20)  NULL,
        [updated_at]        DATETIME     NULL,
        [updated_by]        VARCHAR(20)  NULL,
        CONSTRAINT FK_cmereq_department FOREIGN KEY ([department_id]) REFERENCES [dbo].[departments] ([id])
    );
END
GO

PRINT N'✅ Migration 2026-09-11_training_results hoàn tất.';
GO
