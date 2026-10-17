/* ============================================================================
 * Mở rộng departments (Giai đoạn 6)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   dm_khoa_phong (file dump ql_nckh_dt_cdt) có loai_don_vi (Khoa/Phòng/Trung tâm),
 *   truong_khoa_id (trưởng khoa), dien_thoai, email, so_giuong — departments hiện
 *   tại chưa có. Toàn bộ cột thêm đều NULL-able/có default, không phá dữ liệu
 *   hay API hiện có (chỉ thêm field optional).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.departments', 'unit_type') IS NULL
    ALTER TABLE [dbo].[departments] ADD [unit_type] VARCHAR(20) NOT NULL
        CONSTRAINT DF_departments_unit_type DEFAULT ('khoa');
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_departments_unit_type')
    ALTER TABLE [dbo].[departments] ADD CONSTRAINT [CHK_departments_unit_type]
        CHECK ([unit_type] IN ('khoa','phong','trung_tam'));
GO
IF COL_LENGTH('dbo.departments', 'head_user_id') IS NULL
    ALTER TABLE [dbo].[departments] ADD [head_user_id] VARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_departments_head_user')
    ALTER TABLE [dbo].[departments] ADD CONSTRAINT [FK_departments_head_user]
        FOREIGN KEY ([head_user_id]) REFERENCES [dbo].[users] ([id]);
GO
IF COL_LENGTH('dbo.departments', 'phone') IS NULL
    ALTER TABLE [dbo].[departments] ADD [phone] VARCHAR(20) NULL;
GO
IF COL_LENGTH('dbo.departments', 'email') IS NULL
    ALTER TABLE [dbo].[departments] ADD [email] VARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.departments', 'bed_count') IS NULL
    ALTER TABLE [dbo].[departments] ADD [bed_count] INT NULL;
GO

PRINT N'✅ Migration 2026-09-14_department_enrichment hoàn tất.';
GO
