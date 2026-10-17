/* ============================================================================
 * Siết xác thực 2 lớp (2FA)
 * ----------------------------------------------------------------------------
 *   1. users.totp_last_step: bước thời gian (30 giây) của mã TOTP dùng gần
 *      nhất. Mã cùng bước hoặc cũ hơn bị từ chối — mã OTP bị nhìn trộm / chặn
 *      bắt không dùng lại được trong khung ±30 giây.
 *   2. user_backup_codes: mã khôi phục dùng 1 lần khi mất điện thoại. Lưu HMAC
 *      với khoá nằm ngoài DB (backend/src/utils/secretBox.js), không lưu mã gốc.
 *
 *   Secret TOTP (users.totp_secret) được mã hoá AES-256-GCM ở tầng ứng dụng —
 *   không cần đổi cột; giá trị cũ chưa mã hoá tự được mã hoá lại ở lần đăng
 *   nhập 2FA thành công kế tiếp.
 *
 *   Server tự chạy bước này lúc khởi động (permissions/migrations.js) nếu login
 *   ứng dụng có quyền ALTER / CREATE TABLE; không có thì DBA chạy file này. Idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.users', 'totp_last_step') IS NULL
    ALTER TABLE [dbo].[users] ADD totp_last_step BIGINT NULL;
GO

-- 3. Mốc bắt đầu thời gian chuyển tiếp khi tài khoản quản trị (superuser hoặc
--    có quyền "critical") bị bắt buộc bật 2FA — quá TWOFA_GRACE_DAYS ngày (mặc
--    định 14) mà chưa bật thì bị chặn (backend/src/permissions/twoFactorPolicy.js).
IF COL_LENGTH('dbo.users', 'twofa_required_since') IS NULL
    ALTER TABLE [dbo].[users] ADD twofa_required_since DATETIME2 NULL;
GO

IF OBJECT_ID('dbo.user_backup_codes', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[user_backup_codes] (
        id         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        user_id    VARCHAR(20) NOT NULL
                   CONSTRAINT FK_backup_codes_user REFERENCES [dbo].[users](id) ON DELETE CASCADE,
        code_hash  CHAR(64)    NOT NULL,
        used_at    DATETIME2   NULL,
        created_at DATETIME2   NOT NULL CONSTRAINT DF_backup_codes_created DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_backup_codes_user ON [dbo].[user_backup_codes](user_id, code_hash);
END
GO

PRINT N'✅ Migration 2026-10-11_2fa_hardening hoàn tất.';
GO
