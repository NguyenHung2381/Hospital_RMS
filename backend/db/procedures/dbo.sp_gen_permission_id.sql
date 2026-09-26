-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE PROCEDURE [dbo].[sp_gen_permission_id]
    @module     VARCHAR(10),    -- mã module, ví dụ: 'TOPIC', 'USER', 'FILE'
    @new_id     VARCHAR(20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @prefix VARCHAR(16) = 'PERM' + @module;     -- 4 + ≤10 = ≤14
    DECLARE @count INT;
    SELECT @count = COUNT(*) + 1
    FROM permissions
    WHERE id LIKE @prefix + '%';
    SET @new_id = @prefix + RIGHT('0000' + CAST(@count AS VARCHAR(4)), 4); -- ≤14+4=≤18
    WHILE EXISTS (SELECT 1 FROM permissions WHERE id = @new_id)
    BEGIN
        SET @count += 1;
        SET @new_id = @prefix + RIGHT('0000' + CAST(@count AS VARCHAR(4)), 4);
    END
END;
