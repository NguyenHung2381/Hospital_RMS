-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE PROCEDURE [dbo].[sp_gen_round_id]
    @year         INT,
    @round_number TINYINT,
    @new_id       VARCHAR(10) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @new_id = 'DOT' + CAST(@year AS VARCHAR(4)) + CAST(@round_number AS VARCHAR(1));
    IF EXISTS (SELECT 1 FROM [dbo].[research_rounds] WHERE [id] = @new_id)
        RAISERROR(N'Đợt %d năm %d đã tồn tại', 16, 1, @round_number, @year);
END;
