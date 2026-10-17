-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE PROCEDURE [dbo].[sp_gen_category_id]
    @new_id VARCHAR(6) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @count INT;
    SELECT @count = COUNT(*) + 1 FROM categories;
    SET @new_id = 'CAT' + RIGHT('000' + CAST(@count AS VARCHAR(3)), 3);
    WHILE EXISTS (SELECT 1 FROM categories WHERE id = @new_id)
    BEGIN
        SET @count += 1;
        SET @new_id = 'CAT' + RIGHT('000' + CAST(@count AS VARCHAR(3)), 3);
    END
END;
