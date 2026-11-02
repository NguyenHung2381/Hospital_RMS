/* ============================================================================
 * 2026-12-12_han_dung_mat_khau_tam
 * ----------------------------------------------------------------------------
 *   Hạn dùng của mật khẩu tạm (permissions/tempPasswordPolicy.js).
 *
 *   users.temp_password_issued_at (UTC): lúc cấp mật khẩu tạm — tạo tài khoản,
 *   quản trị đặt lại, cấp tài khoản học viên / thành viên đề tài. NULL khi người
 *   dùng tự đặt mật khẩu. must_change_password = 1 mà quá
 *   TEMP_PASSWORD_TTL_DAYS ngày (Cấu hình hệ thống, mặc định 7) kể từ mốc này
 *   thì không đăng nhập được nữa, phải "Quên mật khẩu" hoặc nhờ quản trị cấp lại.
 *
 *   Tài khoản ĐANG chờ đổi mật khẩu được tính hạn từ lúc chạy migration — không
 *   khóa ngay tài khoản cũ, cho người dùng đủ 1 kỳ hạn để đăng nhập và đổi.
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.users', 'temp_password_issued_at') IS NULL
    ALTER TABLE [dbo].[users] ADD temp_password_issued_at DATETIME2 NULL;
GO

UPDATE [dbo].[users]
SET temp_password_issued_at = SYSUTCDATETIME()
WHERE must_change_password = 1
  AND temp_password_issued_at IS NULL;
GO

PRINT N'✅ Migration 2026-12-12_han_dung_mat_khau_tam hoàn tất.';
GO
