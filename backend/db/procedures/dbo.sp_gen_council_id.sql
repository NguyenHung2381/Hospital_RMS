-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE PROCEDURE [dbo].[sp_gen_council_id]
    @round_id VARCHAR(10),
    @new_id   VARCHAR(15) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @prefix VARCHAR(13) = 'HD' + @round_id + '_';
    DECLARE @count  INT;
    SELECT @count = COUNT(*) + 1
    FROM dbo.councils WITH (UPDLOCK, HOLDLOCK)
    WHERE round_id = @round_id;
    SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
    WHILE EXISTS (SELECT 1 FROM dbo.councils WHERE id = @new_id)
    BEGIN
        SET @count += 1;
        SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
    END
END;
