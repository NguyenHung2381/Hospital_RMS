/* ============================================================================
 * Seed danh mục "Đối tượng học viên" (trainee_types) — hiện đang RỖNG trong DB
 * (user chụp màn hình dropdown "Đối tượng học viên" cho thấy 7 mục tham chiếu
 * từ dm_doi_tuong_hoc_vien của file dump ql_nckh_dt_cdt cũ).
 *
 * Script idempotent — chạy lại nhiều lần an toàn (MERGE theo id cố định).
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

MERGE [dbo].[trainee_types] AS tgt
USING (VALUES
    ('TRNTYPE-BS',  N'Bác sĩ',                 N'Bác sĩ điều trị'),
    ('TRNTYPE-DD',  N'Điều dưỡng',             N'Điều dưỡng các khoa lâm sàng'),
    ('TRNTYPE-KTV', N'Kỹ thuật viên',          N'KTV xét nghiệm, CĐHA, vật lý trị liệu...'),
    ('TRNTYPE-NHS', N'Nữ hộ sinh',             N'Nữ hộ sinh sản phụ khoa'),
    ('TRNTYPE-DSI', N'Dược sĩ',                N'Dược sĩ lâm sàng / nhà thuốc'),
    ('TRNTYPE-QL',  N'Cán bộ quản lý y tế',    N'Lãnh đạo bệnh viện, trưởng khoa/phòng'),
    ('TRNTYPE-SV',  N'Sinh viên y khoa',       N'Sinh viên các trường ĐH Y')
) AS src (id, name, description)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, created_by)
    VALUES (src.id, src.name, src.description, N'SYSTEM')
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description;
GO

PRINT N'✅ Migration 2026-09-14_seed_trainee_types hoàn tất.';
GO
