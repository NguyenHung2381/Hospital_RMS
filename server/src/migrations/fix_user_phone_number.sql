-- Migration: Sửa kiểu dữ liệu cột phone_number trong bảng users
-- Từ varbinary(10) (sai) → varchar(20) (đúng)
-- Chạy script này MỘT LẦN trực tiếp trên SQL Server
USE [RMS_HOSPITAL]
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.users')
      AND name = 'phone_number'
      AND system_type_id = TYPE_ID('varbinary')
)
BEGIN
    ALTER TABLE dbo.users ALTER COLUMN phone_number VARCHAR(20) NULL;
    PRINT 'OK: phone_number đã được chuyển từ varbinary(10) sang varchar(20)';
END
ELSE
BEGIN
    PRINT 'SKIP: phone_number đã là varchar hoặc không tồn tại, không cần migration';
END
GO
