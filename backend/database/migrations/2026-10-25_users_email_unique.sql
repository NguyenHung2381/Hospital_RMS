/* Email không trùng giữa các tài khoản — cần cho đăng nhập / quên mật khẩu bằng
 * email (authService.login, passwordResetService). Bỏ qua NULL và chuỗi rỗng.
 * So khớp theo collation của cột (thường không phân biệt hoa/thường).
 * Schema gốc có thể đã có UQ_users_email (không nằm trong repo) → khi đó bỏ qua.
 * Idempotent.
 * Nếu đang có email trùng, bước tạo index sẽ lỗi — liệt kê bằng:
 *   SELECT email, COUNT(*) FROM users WHERE email <> '' GROUP BY email HAVING COUNT(*) > 1; */
USE [RMS_HOSPITAL];
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal = 1
    WHERE i.object_id = OBJECT_ID('dbo.users') AND i.is_unique = 1
      AND COL_NAME(ic.object_id, ic.column_id) = 'email'
      AND (SELECT COUNT(*) FROM sys.index_columns x WHERE x.object_id = i.object_id AND x.index_id = i.index_id AND x.key_ordinal > 0) = 1
)
    CREATE UNIQUE INDEX UX_users_email ON dbo.users(email) WHERE email IS NOT NULL AND email <> '';
GO
