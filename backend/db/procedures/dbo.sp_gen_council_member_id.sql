-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE PROCEDURE [dbo].[sp_gen_council_member_id]
    @council_id VARCHAR(15),
    @new_id     VARCHAR(25) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @prefix VARCHAR(20) = 'HDM' + @council_id + '_';
    DECLARE @count  INT;
    SELECT @count = COUNT(*) + 1
    FROM dbo.council_members WITH (UPDLOCK, HOLDLOCK)
    WHERE council_id = @council_id;
    SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
    WHILE EXISTS (SELECT 1 FROM dbo.council_members WHERE id = @new_id)
    BEGIN
        SET @count += 1;
        SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
    END
END;
