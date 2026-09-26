-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE PROCEDURE [dbo].[sp_upload_files]
    @topic_id    VARCHAR(15),
    @actor_id    VARCHAR(20),
    @batch_note  NVARCHAR(500) = NULL,
    @files_json  NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    EXEC sp_set_session_context N'current_user_id', @actor_id;

    BEGIN TRANSACTION;
    BEGIN TRY
        IF NOT EXISTS (SELECT 1 FROM dbo.topics WHERE id = @topic_id)
            RAISERROR(N'Đề tài %s không tồn tại', 16, 1, @topic_id);

        DECLARE @batch_id VARCHAR(30);
        EXEC dbo.sp_gen_batch_id @topic_id, @batch_id OUTPUT;

        INSERT INTO dbo.file_batches (id, topic_id, note, created_by)
        VALUES (@batch_id, @topic_id, @batch_note, @actor_id);

        DECLARE @file_name   NVARCHAR(500),
                @file_url    VARCHAR(1000),
                @file_size   BIGINT,
                @mime_type   VARCHAR(100),
                @file_desc   NVARCHAR(MAX),
                @file_id     VARCHAR(32);

        DECLARE fc CURSOR FOR
        SELECT file_name, file_url, file_size, mime_type, description
        FROM OPENJSON(@files_json) WITH (
            file_name    NVARCHAR(500)  '$.file_name',
            file_url     VARCHAR(1000)  '$.file_url',
            file_size    BIGINT         '$.file_size',
            mime_type    VARCHAR(100)   '$.mime_type',
            description  NVARCHAR(MAX)  '$.description'
        );

        OPEN fc;
        FETCH NEXT FROM fc INTO @file_name, @file_url, @file_size, @mime_type, @file_desc;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            EXEC dbo.sp_gen_file_id @topic_id, @file_id OUTPUT;
            INSERT INTO dbo.files (id, topic_id, batch_id, file_name, file_url,
                                   file_size, mime_type, description, created_by)
            VALUES (@file_id, @topic_id, @batch_id, @file_name, @file_url,
                    @file_size, @mime_type, @file_desc, @actor_id);
            FETCH NEXT FROM fc INTO @file_name, @file_url, @file_size, @mime_type, @file_desc;
        END
        CLOSE fc; DEALLOCATE fc;

        COMMIT TRANSACTION;
        SELECT @batch_id AS batch_id,
               (SELECT COUNT(*) FROM dbo.files WHERE batch_id = @batch_id) AS files_uploaded;
    END TRY
    BEGIN CATCH
        IF CURSOR_STATUS('local', 'fc') >= 0 BEGIN CLOSE fc; DEALLOCATE fc; END
        ROLLBACK TRANSACTION; THROW;
    END CATCH
END;
