-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE PROCEDURE [dbo].[sp_gen_member_id]
    @topic_id   VARCHAR(15),
    @new_id     VARCHAR(22)   OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @prefix   VARCHAR(18) = 'TV' + @topic_id + '_';
    DECLARE @count    INT;

    -- UPDLOCK + HOLDLOCK: giữ lock đến hết transaction, ngăn race condition
    SELECT @count = COUNT(*) + 1
    FROM dbo.topic_members WITH (UPDLOCK, HOLDLOCK)
    WHERE topic_id = @topic_id;

    SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);

    WHILE EXISTS (SELECT 1 FROM dbo.topic_members WHERE id = @new_id)
    BEGIN
        SET @count += 1;
        SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
    END
END;
