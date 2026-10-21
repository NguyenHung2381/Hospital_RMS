/* ============================================================================
 * 2026-11-24_trainee_document_types
 * ----------------------------------------------------------------------------
 *   Giai đoạn 3 (docs/ke-hoach-nang-cap-dao-tao.md) — hồ sơ học viên đầy đủ.
 * 1) trainee_document_types: danh mục loại giấy tờ (tab trong Danh mục đào tạo).
 *    required_for_types = các loại khóa (training_types.id, cách nhau dấu phẩy)
 *    bắt buộc nộp loại giấy này — dựng checklist "đã nộp / thiếu".
 *    Mã cũ national_id / degree / other GIỮ NGUYÊN làm id (trainee_documents.doc_type
 *    và form đăng ký công khai đang dùng) — không phải đổi dữ liệu cũ.
 *    Bộ "bắt buộc" seed dưới đây là gợi ý ban đầu, phòng Đào tạo sửa ở danh mục.
 * 2) trainee_documents: status ('approved' | 'pending' | 'rejected') — học viên tự
 *    nộp ở cổng /me thì 'pending' chờ cán bộ duyệt; cán bộ tải lên là 'approved'.
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.trainee_document_types', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[trainee_document_types] (
        [id]                 VARCHAR(30)    NOT NULL PRIMARY KEY,
        [name]               NVARCHAR(255)  NOT NULL,
        [description]        NVARCHAR(MAX)  NULL,
        [required_for_types] VARCHAR(500)   NULL,
        [display_order]      INT            NOT NULL CONSTRAINT DF_trainee_document_types_order DEFAULT (0),
        [created_at]         DATETIME       NOT NULL CONSTRAINT DF_trainee_document_types_created_at DEFAULT (GETDATE()),
        [created_by]         VARCHAR(20)    NULL,
        [updated_at]         DATETIME       NULL,
        [updated_by]         VARCHAR(20)    NULL
    );
END
GO

MERGE [dbo].[trainee_document_types] AS t
USING (VALUES
    ('national_id',  N'CCCD / CMND',                 'TRNTP-GPHN,TRNTP-DTLT,TRNTP-CTCV', 1),
    ('photo',        N'Ảnh thẻ',                      'TRNTP-GPHN,TRNTP-DTLT',            2),
    ('degree',       N'Bằng tốt nghiệp',              'TRNTP-GPHN,TRNTP-DTLT,TRNTP-CTCV', 3),
    ('transcript',   N'Bảng điểm',                    'TRNTP-GPHN',                       4),
    ('license',      N'Chứng chỉ hành nghề',          NULL,                               5),
    ('health_check', N'Giấy khám sức khỏe',           'TRNTP-GPHN',                       6),
    ('application',  N'Đơn đề nghị',                  'TRNTP-GPHN',                       7),
    ('contract',     N'Hợp đồng',                     NULL,                               8),
    ('decision',     N'Quyết định cử đi học',         'TRNTP-DTLT',                       9),
    ('evaluation',   N'Phiếu nhận xét',               NULL,                               10),
    ('other',        N'Khác',                         NULL,                               99)
) AS s (id, name, required_for_types, display_order) ON t.id = s.id
WHEN NOT MATCHED THEN INSERT (id, name, required_for_types, display_order)
    VALUES (s.id, s.name, s.required_for_types, s.display_order);
GO

-- Loại lạ trong dữ liệu cũ (nếu có) ⇒ thêm vào danh mục để không mất nhãn
INSERT INTO [dbo].[trainee_document_types] (id, name, display_order)
SELECT DISTINCT d.doc_type, d.doc_type, 98
FROM [dbo].[trainee_documents] d
WHERE NOT EXISTS (SELECT 1 FROM [dbo].[trainee_document_types] t WHERE t.id = d.doc_type);
GO

IF COL_LENGTH(N'dbo.trainee_documents', N'status') IS NULL
    ALTER TABLE [dbo].[trainee_documents] ADD
        [status]      VARCHAR(10)   NOT NULL CONSTRAINT DF_trainee_documents_status DEFAULT ('approved'),
        [reviewed_at] DATETIME      NULL,
        [reviewed_by] VARCHAR(20)   NULL,
        [review_note] NVARCHAR(255) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_trainee_documents_status')
    ALTER TABLE [dbo].[trainee_documents] ADD CONSTRAINT CHK_trainee_documents_status
        CHECK ([status] IN ('approved', 'pending', 'rejected'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trndoc_type')
    ALTER TABLE [dbo].[trainee_documents] WITH CHECK ADD CONSTRAINT FK_trndoc_type
        FOREIGN KEY ([doc_type]) REFERENCES [dbo].[trainee_document_types] ([id]);
GO

PRINT N'✅ Migration 2026-11-24_trainee_document_types hoàn tất.';
GO
