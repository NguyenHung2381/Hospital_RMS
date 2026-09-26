-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
-- 3. SP kiểm tra + gia hạn token khi dùng lại (sliding expiry)
CREATE PROCEDURE [dbo].[sp_use_refresh_token]
    @token VARCHAR(512)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @user_id     VARCHAR(20);
    DECLARE @remember_me BIT;
    DECLARE @expires_at  DATETIME2;
    DECLARE @id          VARCHAR(60);

    SELECT @id = id, @user_id = user_id,
           @remember_me = remember_me, @expires_at = expires_at
    FROM refresh_tokens
    WHERE token = @token;

    -- Token không tồn tại
    IF @id IS NULL
        RAISERROR(N'Token không hợp lệ', 16, 1);

    -- Token đã hết hạn
    IF @expires_at < GETDATE()
    BEGIN
        DELETE FROM refresh_tokens WHERE id = @id;
        RAISERROR(N'Token đã hết hạn, vui lòng đăng nhập lại', 16, 1);
    END

    -- Gia hạn nếu remember_me = 1 (sliding window)
    IF @remember_me = 1
        UPDATE refresh_tokens
        SET expires_at = DATEADD(DAY, 30, GETDATE())
        WHERE id = @id;

    SELECT @user_id AS user_id, @remember_me AS remember_me;
END;
