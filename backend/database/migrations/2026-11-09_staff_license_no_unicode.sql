/* ============================================================================
 * CCHN — số chứng chỉ hành nghề lưu được chữ Việt (NVARCHAR)
 * ----------------------------------------------------------------------------
 * staff_practice_licenses.license_no đang là VARCHAR(50): số CCHN cấp ngoài Nghệ
 * An có chữ "Đ" ("…/ĐNAI-CCHN", "…/ĐL-CCHN") bị lưu thành "?" — nhập lại file
 * "Danh sách người hành nghề" vẫn ghi "?" và lần nào cũng báo "thay đổi".
 * Đổi sang NVARCHAR(50); index UNIQUE có lọc phải bỏ rồi tạo lại quanh ALTER.
 * Dữ liệu đã hỏng ("?") không khôi phục được ở đây — nhập lại 2.xlsx sẽ sửa.
 *
 * Idempotent — chỉ đổi khi cột còn là varchar; index tạo lại nếu chưa có.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (
    SELECT 1
    FROM sys.columns c
    JOIN sys.types t ON t.user_type_id = c.user_type_id
    WHERE c.object_id = OBJECT_ID(N'dbo.staff_practice_licenses')
      AND c.name = N'license_no'
      AND t.name = N'varchar'
)
BEGIN
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_stafflic_license_no' AND object_id = OBJECT_ID(N'dbo.staff_practice_licenses'))
        DROP INDEX [UQ_stafflic_license_no] ON [dbo].[staff_practice_licenses];
    ALTER TABLE [dbo].[staff_practice_licenses] ALTER COLUMN [license_no] NVARCHAR(50) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_stafflic_license_no' AND object_id = OBJECT_ID(N'dbo.staff_practice_licenses'))
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_stafflic_license_no] ON [dbo].[staff_practice_licenses] ([license_no])
        WHERE [license_no] IS NOT NULL;
GO
