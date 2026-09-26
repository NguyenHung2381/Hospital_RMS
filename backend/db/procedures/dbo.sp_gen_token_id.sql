-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE PROCEDURE [dbo].[sp_gen_token_id]
    @new_id VARCHAR(60) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @new_id = 'RT' + REPLACE(CAST(NEWID() AS VARCHAR(36)), '-', '');
    -- Xác suất trùng cực thấp, kiểm tra lại cho chắc
    WHILE EXISTS (SELECT 1 FROM refresh_tokens WHERE id = @new_id)
        SET @new_id = 'RT' + REPLACE(CAST(NEWID() AS VARCHAR(36)), '-', '');
END;
