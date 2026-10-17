-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE PROCEDURE [dbo].[sp_gen_pgroup_id]
    @new_id VARCHAR(10) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @count INT;
    SELECT @count = COUNT(*) + 1 FROM permission_groups;
    SET @new_id = 'PG' + RIGHT('0000' + CAST(@count AS VARCHAR(4)), 4);
    WHILE EXISTS (SELECT 1 FROM permission_groups WHERE id = @new_id)
    BEGIN
        SET @count += 1;
        SET @new_id = 'PG' + RIGHT('0000' + CAST(@count AS VARCHAR(4)), 4);
    END
END;
