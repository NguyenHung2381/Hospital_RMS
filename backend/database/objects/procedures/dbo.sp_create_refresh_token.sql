-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
-- 2. Stored procedure tạo refresh token (thay vì INSERT thẳng ở app)
CREATE PROCEDURE [dbo].[sp_create_refresh_token]
    @user_id     VARCHAR(20),
    @token       VARCHAR(512),
    @remember_me BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @new_id     VARCHAR(60);
    DECLARE @expires_at DATETIME2;

    EXEC sp_gen_token_id @new_id OUTPUT;

    -- 7 ngày nếu không ghi nhớ, 30 ngày nếu ghi nhớ
    SET @expires_at = DATEADD(DAY, CASE WHEN @remember_me = 1 THEN 30 ELSE 7 END, GETDATE());

    INSERT INTO refresh_tokens (id, user_id, token, expires_at, remember_me)
    VALUES (@new_id, @user_id, @token, @expires_at, @remember_me);

    SELECT @new_id AS id, @expires_at AS expires_at;
END;
