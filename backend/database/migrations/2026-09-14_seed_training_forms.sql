/* ============================================================================
 * Seed danh mục "Hình thức học" (training_forms) — hiện đang RỖNG trong DB.
 *
 * Script idempotent — chạy lại nhiều lần an toàn (MERGE theo id cố định).
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

MERGE [dbo].[training_forms] AS tgt
USING (VALUES
    ('TRNFORM-TT',  N'Trực tiếp tại lớp',     N'Học trực tiếp tại lớp học'),
    ('TRNFORM-OL',  N'Trực tuyến (Online)',   N'Học trực tuyến qua nền tảng E-learning/video call'),
    ('TRNFORM-HB',  N'Kết hợp (Hybrid)',      N'Kết hợp trực tiếp và trực tuyến'),
    ('TRNFORM-ELS', N'E-learning tự học',     N'Tự học qua tài liệu/video, không có lớp cố định'),
    ('TRNFORM-LS',  N'Đi lâm sàng',           N'Thực hành lâm sàng tại khoa/phòng')
) AS src (id, name, description)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, created_by)
    VALUES (src.id, src.name, src.description, N'SYSTEM')
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description;
GO

PRINT N'✅ Migration 2026-09-14_seed_training_forms hoàn tất.';
GO
