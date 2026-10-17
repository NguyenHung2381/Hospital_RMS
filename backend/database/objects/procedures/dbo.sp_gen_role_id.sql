-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE PROCEDURE [dbo].[sp_gen_role_id]
    @new_id VARCHAR(6) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @count INT;
    SELECT @count = COUNT(*) + 1 FROM roles;
    SET @new_id = 'RL' + RIGHT('0000' + CAST(@count AS VARCHAR(4)), 4);
    WHILE EXISTS (SELECT 1 FROM roles WHERE id = @new_id)
    BEGIN
        SET @count += 1;
        SET @new_id = 'RL' + RIGHT('0000' + CAST(@count AS VARCHAR(4)), 4);
    END
END;
