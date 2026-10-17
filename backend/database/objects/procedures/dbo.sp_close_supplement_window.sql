-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE PROCEDURE [dbo].[sp_close_supplement_window]
    @round_id VARCHAR(10),
    @actor_id VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    EXEC sp_set_session_context N'current_user_id', @actor_id;

    IF NOT EXISTS (SELECT 1 FROM [dbo].[research_rounds] WHERE [id] = @round_id)
    BEGIN
        RAISERROR(N'Đợt nghiên cứu %s không tồn tại.', 16, 1, @round_id);
        RETURN;
    END

    DECLARE @affected_topics TABLE ([topic_id] VARCHAR(15));

    BEGIN TRANSACTION;
    BEGIN TRY

        UPDATE [dbo].[topics]
        SET    [status]     = 'approved',
               [updated_at] = GETDATE(),
               [updated_by] = @actor_id
        OUTPUT INSERTED.[id] INTO @affected_topics([topic_id])
        WHERE  [round_id] = @round_id
          AND  [status]   = 'supplement';

        DECLARE @topics_closed INT = @@ROWCOUNT;

        COMMIT TRANSACTION;

        DECLARE @topic_id VARCHAR(15);
        DECLARE @user_ids NVARCHAR(MAX);

        DECLARE tc CURSOR LOCAL FAST_FORWARD FOR
            SELECT [topic_id] FROM @affected_topics;

        OPEN tc;
        FETCH NEXT FROM tc INTO @topic_id;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            SELECT @user_ids = '[' + STRING_AGG('"' + [uid] + '"', ',') + ']'
            FROM (
                SELECT [created_by] AS [uid]
                FROM   [dbo].[topics]
                WHERE  [id] = @topic_id
                  AND  [created_by] IS NOT NULL
                UNION
                SELECT [user_id]
                FROM   [dbo].[topic_members]
                WHERE  [topic_id] = @topic_id
                  AND  [user_id]  IS NOT NULL
            ) x;

            IF @user_ids IS NOT NULL AND @user_ids <> '[]'
                EXEC [dbo].[sp_push_notification]
                    @type     = 'supplement_closed',
                    @title    = N'Đợt bổ sung thông tin đề tài đã kết thúc',
                    @message  = N'Cửa sổ bổ sung thông tin đã đóng. Đề tài đã trở về trạng thái phê duyệt.',
                    @ref_id   = @topic_id,
                    @ref_type = 'topic',
                    @user_ids = @user_ids;

            FETCH NEXT FROM tc INTO @topic_id;
        END
        CLOSE tc;
        DEALLOCATE tc;

        SELECT @topics_closed AS [topics_closed];

    END TRY
    BEGIN CATCH
        IF CURSOR_STATUS('local', 'tc') >= 0 BEGIN CLOSE tc; DEALLOCATE tc; END
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
