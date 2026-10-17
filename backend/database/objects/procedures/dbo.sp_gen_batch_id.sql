-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE PROCEDURE [dbo].[sp_gen_batch_id]
    @topic_id VARCHAR(15),
    @new_id   VARCHAR(30) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ds     VARCHAR(8)  = CONVERT(VARCHAR(8), GETDATE(), 112);
    DECLARE @prefix VARCHAR(28) = 'BATCH' + @topic_id + @ds;
    DECLARE @count  INT;
    SELECT @count = COUNT(*) + 1 FROM dbo.file_batches WHERE id LIKE @prefix + '%';
    SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
    WHILE EXISTS (SELECT 1 FROM dbo.file_batches WHERE id = @new_id)
    BEGIN
        SET @count += 1;
        SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
    END
END;
