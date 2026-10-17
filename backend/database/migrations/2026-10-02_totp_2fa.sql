/* ============================================================================
 * Xác thực 2 lớp (2FA/TOTP) tự nguyện cho tài khoản — Giai đoạn D5
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Thêm cột lên bảng `users` có sẵn (không bảng mới) — mirror cách
 *   2026-09-11_security_hardening.sql thêm failed_login_count/locked_until.
 *   totp_secret lưu dạng text (Base32, chuẩn RFC 4648 của thư viện otplib) —
 *   không mã hoá thêm, chấp nhận đánh đổi như SMTP_PASS ở system_settings
 *   (đơn giản, đúng mức bảo mật hiện có của DB). totp_enabled=0 nghĩa là CHƯA
 *   bật (dù đã có secret do đang ở bước setup chưa xác nhận mã đầu tiên) —
 *   authService.login() chỉ bắt đăng thêm bước OTP khi = 1.
 *
 *   KHÔNG bắt buộc 2FA toàn hệ thống — mỗi tài khoản tự bật/tắt qua Hồ sơ cá
 *   nhân (Profile.tsx). "Ép buộc theo vai trò" để sau nếu thực sự cần.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.users', N'totp_secret') IS NULL
    ALTER TABLE [dbo].[users] ADD [totp_secret] NVARCHAR(255) NULL;
GO
IF COL_LENGTH(N'dbo.users', N'totp_enabled') IS NULL
    ALTER TABLE [dbo].[users]
        ADD [totp_enabled] BIT NOT NULL CONSTRAINT DF_users_totp_enabled DEFAULT (0);
GO
IF COL_LENGTH(N'dbo.users', N'totp_verified_at') IS NULL
    ALTER TABLE [dbo].[users] ADD [totp_verified_at] DATETIME NULL;
GO

PRINT N'✅ Migration 2026-10-02_totp_2fa hoàn tất.';
GO
