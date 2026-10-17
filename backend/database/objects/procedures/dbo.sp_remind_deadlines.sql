-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE PROCEDURE [dbo].[sp_remind_deadlines]
    @days_ahead INT = 3
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @topic_id VARCHAR(15);
    DECLARE @deadline DATE;
    DECLARE @title    NVARCHAR(255);
    DECLARE @user_ids NVARCHAR(MAX);

    DECLARE dc CURSOR LOCAL FAST_FORWARD FOR
        SELECT DISTINCT t.[id], CAST(r.[end_date] AS DATE) AS deadline
        FROM   [dbo].[topics] t
        JOIN   [dbo].[research_rounds] r ON r.[id] = t.[round_id]
        WHERE  t.[status] IN ('approved', 'submitted')
          AND  DATEDIFF(DAY, CAST(GETDATE() AS DATE), CAST(r.[end_date] AS DATE)) = @days_ahead;

    OPEN dc;
    FETCH NEXT FROM dc INTO @topic_id, @deadline;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @title = N'Nhắc nhở: hạn nộp còn ' + CAST(@days_ahead AS NVARCHAR(5)) + N' ngày ('
                   + CONVERT(NVARCHAR(10), @deadline, 103) + N')';

        SELECT @user_ids = '[' + STRING_AGG('"' + uid + '"', ',') + ']'
        FROM (
            SELECT t2.[created_by] AS uid FROM [dbo].[topics] t2 WHERE t2.[id] = @topic_id
            UNION
            SELECT tm.[user_id] FROM [dbo].[topic_members] tm
            WHERE  tm.[topic_id] = @topic_id AND tm.[user_id] IS NOT NULL
        ) x;

        IF @user_ids IS NOT NULL AND @user_ids <> '[]'
            EXEC [dbo].[sp_push_notification]
                @type     = 'deadline_reminder',
                @title    = @title,
                @ref_id   = @topic_id,
                @ref_type = 'topic',
                @user_ids = @user_ids;

        FETCH NEXT FROM dc INTO @topic_id, @deadline;
    END
    CLOSE dc; DEALLOCATE dc;
END;
