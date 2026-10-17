-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE TRIGGER [dbo].[trg_dept_gen_id]
ON [dbo].[departments]
INSTEAD OF INSERT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @new_id          VARCHAR(20);
    DECLARE @count           INT;
    DECLARE @abbreviation    VARCHAR(20);
    DECLARE @name            NVARCHAR(255);
    DECLARE @code            VARCHAR(20);
    DECLARE @parent_id       VARCHAR(20);
    DECLARE @description     NVARCHAR(MAX);
    DECLARE @dept_account_id VARCHAR(20);
    DECLARE @created_at      DATETIME2;
    DECLARE @created_by      VARCHAR(20);

    DECLARE cur CURSOR FOR
        SELECT [abbreviation], [name], [code], [parent_id],
               [description], [dept_account_id], [created_at], [created_by]
        FROM inserted;

    OPEN cur;
    FETCH NEXT FROM cur INTO @abbreviation, @name, @code, @parent_id,
                              @description, @dept_account_id, @created_at, @created_by;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SELECT @count = COUNT(*) + 1 FROM [dbo].[departments] WHERE [id] LIKE 'DV%';
        SET @new_id = 'DV' + RIGHT('000' + CAST(@count AS VARCHAR(3)), 3);
        WHILE EXISTS (SELECT 1 FROM [dbo].[departments] WHERE [id] = @new_id)
        BEGIN
            SET @count  += 1;
            SET @new_id  = 'DV' + RIGHT('000' + CAST(@count AS VARCHAR(3)), 3);
        END

        INSERT INTO [dbo].[departments]
            ([id], [name], [code], [abbreviation], [parent_id],
             [description], [dept_account_id], [created_at], [created_by])
        VALUES
            (@new_id, @name, @code, @abbreviation, @parent_id,
             @description, @dept_account_id,
             ISNULL(@created_at, GETDATE()), @created_by);

        FETCH NEXT FROM cur INTO @abbreviation, @name, @code, @parent_id,
                                  @description, @dept_account_id, @created_at, @created_by;
    END
    CLOSE cur; DEALLOCATE cur;
END;
