-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE   PROCEDURE [dbo].[sp_gen_user_id]
    @dept_code VARCHAR(20), @is_dept_account BIT = 0, @new_id VARCHAR(20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @prefix VARCHAR(12) = 'NV' + @dept_code;

    IF @is_dept_account = 1
    BEGIN
        SET @new_id = @prefix + '0000';
        IF EXISTS (SELECT 1 FROM users WHERE id = @new_id)
            RAISERROR(N'Tài khoản khoa %s đã tồn tại', 16, 1, @dept_code);
        RETURN;
    END

    DECLARE @lock_res NVARCHAR(64) = N'gen_user_id_' + @prefix;
    -- FIX: NVARCHAR(10) -> NVARCHAR(20) (chuỗi 'Transaction' dài 11 ký tự)
    DECLARE @owner NVARCHAR(20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @rc INT;
    EXEC @rc = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive',
                             @LockOwner = @owner, @LockTimeout = 5000;
    IF @rc < 0
    BEGIN
        RAISERROR(N'Không lấy được khóa sinh mã nhân viên, vui lòng thử lại', 16, 1);
        RETURN;
    END

    DECLARE @count INT;
    SELECT @count = ISNULL(MAX(CAST(RIGHT(id,4) AS INT)), 0) + 1
    FROM users
    WHERE id LIKE @prefix + '[0-9][0-9][0-9][0-9]' AND RIGHT(id,4) <> '0000';
    IF @count < 1 SET @count = 1;

    SET @new_id = @prefix + RIGHT('0000' + CAST(@count AS VARCHAR(4)), 4);

    IF @owner = N'Session'
        EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = N'Session';
END;
