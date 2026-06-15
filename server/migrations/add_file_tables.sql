USE [RMS_HOSPITAL];
GO

-- ============================================================
-- Migration: Tạo bảng file_batches và files cho tính năng
--            quản lý tài liệu đính kèm đề tài nghiên cứu
-- Chạy sau: change_topic_id_format.sql
-- ============================================================

-- ── Bảng file_batches ─────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'file_batches')
BEGIN
    CREATE TABLE [dbo].[file_batches] (
        [id]         VARCHAR(30)    NOT NULL,
        [topic_id]   VARCHAR(15)    NOT NULL,
        [note]       NVARCHAR(500)  NULL,
        [created_by] VARCHAR(20)    NOT NULL,
        [created_at] DATETIME2(7)   NOT NULL CONSTRAINT DF_fb_created_at DEFAULT(GETDATE()),
        CONSTRAINT PK_file_batches PRIMARY KEY CLUSTERED ([id] ASC),
        CONSTRAINT FK_batch_topic  FOREIGN KEY ([topic_id])
            REFERENCES [dbo].[topics]([id]) ON DELETE CASCADE,
        CONSTRAINT FK_batch_user   FOREIGN KEY ([created_by])
            REFERENCES [dbo].[users]([id])
    );
    PRINT 'Created table: file_batches';
END
ELSE
    PRINT 'Table file_batches already exists — skipped';
GO

-- ── Bảng files ────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'files')
BEGIN
    CREATE TABLE [dbo].[files] (
        [id]          VARCHAR(32)    NOT NULL,
        [topic_id]    VARCHAR(15)    NOT NULL,
        [batch_id]    VARCHAR(30)    NOT NULL,
        [file_name]   NVARCHAR(500)  NOT NULL,
        [file_url]    VARCHAR(1000)  NOT NULL,
        [file_size]   BIGINT         NULL,
        [mime_type]   VARCHAR(100)   NULL,
        [description] NVARCHAR(MAX)  NULL,
        [is_deleted]  BIT            NOT NULL CONSTRAINT DF_files_is_deleted  DEFAULT(0),
        [created_by]  VARCHAR(20)    NULL,
        [created_at]  DATETIME2(7)   NOT NULL CONSTRAINT DF_files_created_at  DEFAULT(GETDATE()),
        [updated_by]  VARCHAR(20)    NULL,
        [updated_at]  DATETIME2(7)   NULL,
        CONSTRAINT PK_files      PRIMARY KEY CLUSTERED ([id] ASC),
        CONSTRAINT FK_file_topic FOREIGN KEY ([topic_id])
            REFERENCES [dbo].[topics]([id]) ON DELETE CASCADE,
        CONSTRAINT FK_file_batch FOREIGN KEY ([batch_id])
            REFERENCES [dbo].[file_batches]([id])
    );
    CREATE NONCLUSTERED INDEX IX_files_topic ON [dbo].[files] ([topic_id], [is_deleted]);
    PRINT 'Created table: files';
END
ELSE
    PRINT 'Table files already exists — skipped';
GO

-- ── sp_gen_batch_id ───────────────────────────────────────────
IF OBJECT_ID('dbo.sp_gen_batch_id', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[sp_gen_batch_id];
GO
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
GO

-- ── sp_gen_file_id ────────────────────────────────────────────
IF OBJECT_ID('dbo.sp_gen_file_id', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[sp_gen_file_id];
GO
CREATE PROCEDURE [dbo].[sp_gen_file_id]
    @topic_id VARCHAR(15),
    @new_id   VARCHAR(32) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ds     VARCHAR(8)  = CONVERT(VARCHAR(8), GETDATE(), 112);
    DECLARE @prefix VARCHAR(26) = 'FILE' + @topic_id + @ds;
    DECLARE @count  INT;
    SELECT @count = COUNT(*) + 1 FROM dbo.files
    WHERE topic_id = @topic_id AND id LIKE @prefix + '%';
    SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
    WHILE EXISTS (SELECT 1 FROM dbo.files WHERE id = @new_id)
    BEGIN
        SET @count += 1;
        SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
    END
END;
GO

-- ── sp_upload_files ───────────────────────────────────────────
IF OBJECT_ID('dbo.sp_upload_files', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[sp_upload_files];
GO
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
GO

PRINT 'Migration add_file_tables.sql completed.';
