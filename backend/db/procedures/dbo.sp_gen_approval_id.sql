-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE PROCEDURE [dbo].[sp_gen_approval_id]
    @new_id VARCHAR(16) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ds     VARCHAR(8)  = CONVERT(VARCHAR(8), GETDATE(), 112);
    DECLARE @prefix VARCHAR(11) = 'APV' + @ds;          -- 3+8 = 11
    DECLARE @count INT;
    SELECT @count = COUNT(*) + 1
    FROM approvals
    WHERE id LIKE @prefix + '%';
    SET @new_id = @prefix + RIGHT('00000' + CAST(@count AS VARCHAR(5)), 5); -- 11+5=16
    WHILE EXISTS (SELECT 1 FROM approvals WHERE id = @new_id)
    BEGIN
        SET @count += 1;
        SET @new_id = @prefix + RIGHT('00000' + CAST(@count AS VARCHAR(5)), 5);
    END
END;
