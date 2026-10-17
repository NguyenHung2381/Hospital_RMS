/* Quên mật khẩu bằng OTP gửi qua email (services/passwordResetService.js).
 * Idempotent. */
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID('dbo.password_reset_otps', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.password_reset_otps (
        user_id    VARCHAR(20) NOT NULL PRIMARY KEY
                   CONSTRAINT FK_pwreset_user REFERENCES dbo.users(id) ON DELETE CASCADE,
        code_hash  CHAR(64)    NOT NULL,
        attempts   INT         NOT NULL CONSTRAINT DF_pwreset_attempts DEFAULT 0,
        expires_at DATETIME2   NOT NULL,
        created_at DATETIME2   NOT NULL CONSTRAINT DF_pwreset_created DEFAULT SYSUTCDATETIME()
    );
END
GO
