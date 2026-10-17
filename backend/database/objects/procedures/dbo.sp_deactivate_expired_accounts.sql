-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
-- 4b. sp_deactivate_expired_accounts: 'member' -> vai trò VT06
CREATE   PROCEDURE [dbo].[sp_deactivate_expired_accounts]
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE users
    SET is_active  = 0,
        updated_at = GETDATE()
    WHERE is_active        = 1
      AND role_id          = 'VT06'           -- chỉ TK thành viên (tạm thời)
      AND account_expires_at IS NOT NULL
      AND account_expires_at < CAST(GETDATE() AS DATE);

    SELECT @@ROWCOUNT AS deactivated_count;
END;
