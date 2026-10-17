/* ============================================================================
 * Cấu hình hệ thống qua UI (Giai đoạn 6)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Mirror dm_cau_hinh (key-value) từ file dump ql_nckh_dt_cdt. Hospital_RMS
 *   hiện đọc toàn bộ config nghiệp vụ (ngưỡng CME, SMTP, URL public cho email)
 *   từ .env — mailService.js chỉ đọc process.env. Bảng này cho phép admin sửa
 *   các giá trị hay đổi qua màn hình cài đặt thay vì sửa .env + restart server.
 *
 *   .env vẫn là fallback nếu bảng rỗng (không phá môi trường dev/test chưa
 *   migrate/chưa seed).
 *
 *   BẢO MẬT: SMTP_PASS lưu dạng text (đúng như dm_cau_hinh bản gốc) — API đọc
 *   PHẢI che giá trị khi trả về (không bao giờ trả plaintext qua GET), chỉ ghi
 *   đè khi admin nhập giá trị mới. Quyền xem/sửa giới hạn ở MANAGE, không có
 *   READ rộng như các danh mục khác.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.system_settings', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[system_settings] (
        [setting_key] VARCHAR(50)   NOT NULL PRIMARY KEY,
        [value]       NVARCHAR(MAX) NULL,
        [description] NVARCHAR(255) NULL,
        [updated_at]  DATETIME      NOT NULL CONSTRAINT DF_system_settings_updated_at DEFAULT (GETDATE()),
        [updated_by]  VARCHAR(20)   NULL
    );
END
GO

------------------------------------------------------------------------------
-- Seed các key tương đương dm_cau_hinh bản gốc — value NULL nghĩa là "chưa cấu
-- hình, dùng .env" (mailService.js/cmeRequirementService.js sẽ fallback).
------------------------------------------------------------------------------
MERGE [dbo].[system_settings] AS tgt
USING (VALUES
    ('CME_CYCLE_YEARS', NULL, N'CME: số năm 1 chu kỳ tính ngưỡng'),
    ('CME_MIN_HOURS',   NULL, N'CME: số giờ tín chỉ tối thiểu mỗi chu kỳ'),
    ('MAIL_ENABLED',    NULL, N'1 = Bật gửi mail, 0 = Tắt (chỉ log). Để trống = dùng .env'),
    ('PUBLIC_BASE_URL', NULL, N'URL gốc cho link tra cứu trong email'),
    ('SMTP_FROM_NAME',  NULL, N'Tên người gửi'),
    ('SMTP_HOST',       NULL, N'SMTP server (vd: smtp.gmail.com)'),
    ('SMTP_PORT',       NULL, N'SMTP port (587 = TLS, 465 = SSL)'),
    ('SMTP_SECURE',     NULL, N'tls hoặc ssl'),
    ('SMTP_USER',       NULL, N'Email gửi'),
    ('SMTP_PASS',       NULL, N'App password — luôn bị che khi đọc qua API')
) AS src (setting_key, value, description)
ON tgt.setting_key = src.setting_key
WHEN NOT MATCHED BY TARGET THEN
    INSERT (setting_key, value, description, updated_by)
    VALUES (src.setting_key, src.value, src.description, N'SYSTEM');
GO

------------------------------------------------------------------------------
-- Quyền mới — resource 'system_settings', chỉ MANAGE (không tách read/create/
-- update/delete vì đây là 1 bảng key-value đơn, không phải danh mục CRUD).
------------------------------------------------------------------------------
MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-SETTINGS-MANAGE', N'Quản lý cấu hình hệ thống', N'Xem và sửa cấu hình hệ thống (SMTP, ngưỡng CME, URL public)', 'system_settings', 'manage', 10)
) AS src (id, name, description, resource, action, sort_order)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, sort_order, created_at, created_by, resource, action)
    VALUES (src.id, src.name, src.description, src.sort_order, GETDATE(), N'SYSTEM', src.resource, src.action)
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description, sort_order = src.sort_order;
GO

MERGE [dbo].[role_permissions] AS tgt
USING (VALUES
    ('VT01','PERM-SETTINGS-MANAGE')
) AS src (role_id, permission_id)
ON tgt.role_id = src.role_id AND tgt.permission_id = src.permission_id
WHEN NOT MATCHED BY TARGET
     AND EXISTS (SELECT 1 FROM [dbo].[roles] r WHERE r.id = src.role_id)
     AND EXISTS (SELECT 1 FROM [dbo].[permissions] p WHERE p.id = src.permission_id) THEN
    INSERT (role_id, permission_id, created_by)
    VALUES (src.role_id, src.permission_id, N'SYSTEM');
GO

PRINT N'✅ Migration 2026-09-14_system_settings hoàn tất.';
GO
