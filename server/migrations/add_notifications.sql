USE [RMS_HOSPITAL];
GO

-- ─── notifications table ──────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'notifications')
BEGIN
  CREATE TABLE [dbo].[notifications] (
    [id]         VARCHAR(30)   NOT NULL,
    [user_id]    VARCHAR(20)   NOT NULL,
    [type]       VARCHAR(50)   NOT NULL,
    [title]      NVARCHAR(255) NOT NULL,
    [message]    NVARCHAR(MAX) NULL,
    [ref_id]     VARCHAR(30)   NULL,
    [ref_type]   VARCHAR(20)   NULL,
    [is_read]    BIT           NOT NULL CONSTRAINT DF_notif_is_read    DEFAULT(0),
    [created_at] DATETIME2(7)  NOT NULL CONSTRAINT DF_notif_created_at DEFAULT(GETDATE()),
    CONSTRAINT PK_notifications PRIMARY KEY CLUSTERED ([id] ASC),
    CONSTRAINT FK_notif_user    FOREIGN KEY ([user_id]) REFERENCES [users]([id]) ON DELETE CASCADE,
    CONSTRAINT CHK_notif_id     CHECK ([id] LIKE 'TB%')
  );

  CREATE NONCLUSTERED INDEX IX_notif_user_read
    ON [dbo].[notifications] ([user_id], [is_read])
    INCLUDE ([created_at]);

  PRINT 'Created table: notifications';
END
GO

-- ─── sp_gen_notification_id ───────────────────────────────────────────────────
IF OBJECT_ID('dbo.sp_gen_notification_id', 'P') IS NOT NULL
  DROP PROCEDURE dbo.sp_gen_notification_id;
GO
CREATE PROCEDURE [dbo].[sp_gen_notification_id]
  @new_id VARCHAR(30) OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @ds     VARCHAR(8)  = CONVERT(VARCHAR(8), GETDATE(), 112);
  DECLARE @prefix VARCHAR(12) = 'TB' + @ds;
  DECLARE @count  INT;
  SELECT @count = COUNT(*) + 1 FROM notifications WHERE id LIKE @prefix + '%';
  SET @new_id = @prefix + RIGHT('00000' + CAST(@count AS VARCHAR(5)), 5);
  WHILE EXISTS (SELECT 1 FROM notifications WHERE id = @new_id)
  BEGIN
    SET @count += 1;
    SET @new_id = @prefix + RIGHT('00000' + CAST(@count AS VARCHAR(5)), 5);
  END
END;
GO

-- ─── sp_push_notification ─────────────────────────────────────────────────────
-- Inserts a notification row for each user ID in the JSON array @user_ids.
-- @user_ids example: '["U001","U002"]'
IF OBJECT_ID('dbo.sp_push_notification', 'P') IS NOT NULL
  DROP PROCEDURE dbo.sp_push_notification;
GO
CREATE PROCEDURE [dbo].[sp_push_notification]
  @type     VARCHAR(50),
  @title    NVARCHAR(255),
  @message  NVARCHAR(MAX) = NULL,
  @ref_id   VARCHAR(30)   = NULL,
  @ref_type VARCHAR(20)   = NULL,
  @user_ids NVARCHAR(MAX)
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @uid VARCHAR(20);
  DECLARE @nid VARCHAR(30);

  DECLARE uc CURSOR LOCAL FAST_FORWARD FOR
    SELECT value FROM OPENJSON(@user_ids);

  OPEN uc;
  FETCH NEXT FROM uc INTO @uid;
  WHILE @@FETCH_STATUS = 0
  BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE id = @uid)
    BEGIN
      EXEC sp_gen_notification_id @nid OUTPUT;
      INSERT INTO notifications (id, user_id, type, title, message, ref_id, ref_type)
      VALUES (@nid, @uid, @type, @title, @message, @ref_id, @ref_type);
    END
    FETCH NEXT FROM uc INTO @uid;
  END
  CLOSE uc;
  DEALLOCATE uc;
END;
GO

-- ─── sp_remind_deadlines ──────────────────────────────────────────────────────
-- Run as a SQL Agent job (e.g. daily at 08:00) to push deadline reminders.
IF OBJECT_ID('dbo.sp_remind_deadlines', 'P') IS NOT NULL
  DROP PROCEDURE dbo.sp_remind_deadlines;
GO
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
    SELECT DISTINCT t.id, CAST(r.end_date AS DATE) AS deadline
    FROM   topics t
    JOIN   research_rounds r ON r.id = t.round_id
    WHERE  t.status IN ('approved', 'submitted')
      AND  DATEDIFF(DAY, CAST(GETDATE() AS DATE), CAST(r.end_date AS DATE)) = @days_ahead;

  OPEN dc;
  FETCH NEXT FROM dc INTO @topic_id, @deadline;
  WHILE @@FETCH_STATUS = 0
  BEGIN
    SET @title = N'Nhắc nhở: hạn nộp còn ' + CAST(@days_ahead AS NVARCHAR(5)) + N' ngày ('
               + CONVERT(NVARCHAR(10), @deadline, 103) + N')';

    SELECT @user_ids = '[' + STRING_AGG('"' + uid + '"', ',') + ']'
    FROM (
      SELECT t2.created_by AS uid FROM topics t2 WHERE t2.id = @topic_id
      UNION
      SELECT tm.user_id FROM topic_members tm
      WHERE  tm.topic_id = @topic_id AND tm.user_id IS NOT NULL
    ) x;

    IF @user_ids IS NOT NULL AND @user_ids <> '[]'
      EXEC sp_push_notification
        @type     = 'deadline_reminder',
        @title    = @title,
        @ref_id   = @topic_id,
        @ref_type = 'topic',
        @user_ids = @user_ids;

    FETCH NEXT FROM dc INTO @topic_id, @deadline;
  END
  CLOSE dc;
  DEALLOCATE dc;
END;
GO

PRINT 'Notification migration complete.';
