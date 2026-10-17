-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE PROCEDURE [dbo].[sp_gen_external_reviewer_id]
	@new_id VARCHAR(20) OUTPUT
AS
BEGIN
	SET NOCOUNT ON;
	DECLARE @prefix VARCHAR(4) = 'EXR';
	DECLARE @count  INT;
	SELECT @count = COUNT(*) + 1 FROM dbo.external_reviewers WITH (UPDLOCK, HOLDLOCK);
	SET @new_id = @prefix + RIGHT('0000' + CAST(@count AS VARCHAR(4)), 4);
	WHILE EXISTS (SELECT 1 FROM dbo.external_reviewers WHERE id = @new_id)
	BEGIN
		SET @count += 1;
		SET @new_id = @prefix + RIGHT('0000' + CAST(@count AS VARCHAR(4)), 4);
	END
END;
