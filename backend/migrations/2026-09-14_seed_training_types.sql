/* ============================================================================
 * Seed danh mục "Loại hình đào tạo" (training_types) — hiện đang RỖNG trong DB.
 *
 * Script idempotent — chạy lại nhiều lần an toàn (MERGE theo id cố định).
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

MERGE [dbo].[training_types] AS tgt
USING (VALUES
    ('TRNTP-CME', N'Đào tạo y khoa liên tục (CME)', N'Continuing Medical Education'),
    ('TRNTP-TOT', N'Đào tạo giảng viên (TOT)',      N'Training of Trainers'),
    ('TRNTP-CDT', N'Chỉ đạo tuyến',                 N'Đào tạo, hỗ trợ tuyến dưới'),
    ('TRNTP-CS',  N'Đào tạo chuyên sâu',            N'Chuyên khoa, kỹ thuật chuyên sâu'),
    ('TRNTP-NH',  N'Đào tạo ngắn hạn',              N'Khoá học ngắn ngày'),
    ('TRNTP-GPHN', N'Giấy phép hành nghề',          N'Đào tạo phục vụ cấp/gia hạn giấy phép hành nghề')
) AS src (id, name, description)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, created_by)
    VALUES (src.id, src.name, src.description, N'SYSTEM')
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description;
GO

PRINT N'✅ Migration 2026-09-14_seed_training_types hoàn tất.';
GO
