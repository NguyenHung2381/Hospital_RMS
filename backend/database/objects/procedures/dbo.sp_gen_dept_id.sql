-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE PROCEDURE [dbo].[sp_gen_dept_id]
    @abbreviation VARCHAR(20),  -- viết tắt khoa/phòng (departments.abbreviation)
    @new_id       VARCHAR(20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @prefix VARCHAR(16) = 'DEPT' + @abbreviation;
    DECLARE @count  INT;
    SELECT  @count = COUNT(*) + 1
    FROM    [dbo].[departments]
    WHERE   [id] LIKE @prefix + '%';
    SET     @new_id = @prefix + RIGHT('0000' + CAST(@count AS VARCHAR(4)), 4);
    WHILE EXISTS (SELECT 1 FROM [dbo].[departments] WHERE [id] = @new_id)
    BEGIN
        SET @count  += 1;
        SET @new_id  = @prefix + RIGHT('0000' + CAST(@count AS VARCHAR(4)), 4);
    END
END;
