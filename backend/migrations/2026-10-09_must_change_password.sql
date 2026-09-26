/* ============================================================================
 * Bắt buộc đổi mật khẩu cho tài khoản dùng mật khẩu do người khác cấp
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Tài khoản cấp hàng loạt (thành viên đề tài, học viên) và tài khoản quản
 *   trị đặt lại mật khẩu trước đây đều dùng chung '123456', username đoán được
 *   (chữ cái đầu + mã NV) — kẻ tấn công chỉ cần thử 1 lần/tài khoản là vào,
 *   không bao giờ chạm ngưỡng khoá tài khoản.
 *
 *   users.must_change_password = 1 ⇒ API chỉ cho đổi mật khẩu / đăng xuất
 *   (middlewares/auth.js) cho tới khi người dùng tự đặt mật khẩu mới.
 *
 *   Server tự chạy bước này lúc khởi động (permissions/migrations.js) nếu login
 *   ứng dụng có quyền ALTER; không có thì DBA chạy file này. Idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.users', 'must_change_password') IS NULL
BEGIN
    ALTER TABLE [dbo].[users]
        ADD must_change_password BIT NOT NULL
            CONSTRAINT DF_users_must_change_password DEFAULT 0;

    -- Chỉ lần đầu thêm cột: tài khoản chưa từng tự đổi mật khẩu phải đổi ở lần
    -- đăng nhập tới. EXEC để tách batch (cột vừa thêm chưa được biên dịch).
    EXEC('UPDATE [dbo].[users] SET must_change_password = 1 WHERE password_changed_at IS NULL');
END
GO

PRINT N'✅ Migration 2026-10-09_must_change_password hoàn tất.';
GO
