/* Bổ sung cột created_at / created_by cho system_settings — 2026-09-14_system_settings.sql
 * chỉ tạo updated_at / updated_by, trong khi systemSettingService.update() (MERGE …
 * WHEN NOT MATCHED THEN INSERT) ghi created_by → lỗi "Invalid column name 'created_by'"
 * mỗi lần lưu cấu hình (SQL Server biên dịch cả nhánh INSERT dù key đã tồn tại).
 * created_by NULL được — các dòng seed sẵn không có người tạo.
 * Idempotent. */
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.system_settings', N'U') IS NOT NULL AND COL_LENGTH('dbo.system_settings', 'created_at') IS NULL
    ALTER TABLE [dbo].[system_settings] ADD [created_at] DATETIME NOT NULL
        CONSTRAINT DF_system_settings_created_at DEFAULT (GETDATE());
GO

IF OBJECT_ID(N'dbo.system_settings', N'U') IS NOT NULL AND COL_LENGTH('dbo.system_settings', 'created_by') IS NULL
    ALTER TABLE [dbo].[system_settings] ADD [created_by] VARCHAR(20) NULL;
GO
