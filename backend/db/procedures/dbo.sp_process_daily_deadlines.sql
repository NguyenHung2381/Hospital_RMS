-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
-- ===========================================================
-- BƯỚC 9: Tích hợp cleanup vào sp_process_daily_deadlines
-- ===========================================================
-- sp_process_daily_deadlines đã được gọi bởi SQL Agent Job hàng ngày
-- → thêm EXEC cleanup vào cuối SP để chạy tự động mỗi ngày
CREATE PROCEDURE [dbo].[sp_process_daily_deadlines]
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @today DATE      = CAST(GETDATE() AS DATE);
    DECLARE @now   DATETIME2 = SYSDATETIME();

    -- --------------------------------------------------------
    -- A. Tạo deadline_actions cho reminder 3d & 1d
    -- --------------------------------------------------------
    ;WITH pending_reminders AS (
        SELECT
            rd.[id]            AS dl_id,
            rd.[name]          AS dl_name,
            rd.[deadline_date],
            rd.[deadline_type],
            rd.[round_id],
            DATEDIFF(DAY, @today, rd.[deadline_date]) AS days_left,
            CASE DATEDIFF(DAY, @today, rd.[deadline_date])
                WHEN 3 THEN 'reminder_3d'
                WHEN 1 THEN 'reminder_1d'
            END AS action_type
        FROM [dbo].[round_deadlines] rd
        WHERE rd.[deadline_date] BETWEEN @today AND DATEADD(DAY, 3, @today)
          AND DATEDIFF(DAY, @today, rd.[deadline_date]) IN (1, 3)
    ),
    new_actions AS (
        SELECT pr.*
        FROM pending_reminders pr
        WHERE NOT EXISTS (
            SELECT 1 FROM [dbo].[deadline_actions] da
            WHERE da.[deadline_id] = pr.dl_id
              AND da.[action_type]  = pr.action_type
              AND da.[is_executed]  = 1
        )
    )
    INSERT INTO [dbo].[deadline_actions]
        ([id], [deadline_id], [action_type], [is_executed], [executed_at])
    SELECT
        'DA' + FORMAT(
            ROW_NUMBER() OVER (ORDER BY na.dl_id)
            + ISNULL((SELECT MAX(CAST(SUBSTRING([id],3,18) AS BIGINT))
                      FROM [dbo].[deadline_actions] WHERE [id] LIKE 'DA%'), 0),
            '000000000000000000'),
        na.dl_id, na.action_type, 1, @now
    FROM new_actions na;

    -- --------------------------------------------------------
    -- A2. Gửi thông báo nhắc nhở cho principal_investigator
    -- --------------------------------------------------------
    ;WITH recent_actions AS (
        SELECT
            da.[deadline_id],
            da.[action_type],
            rd.[round_id],
            rd.[name]          AS dl_name,
            rd.[deadline_date],
            rd.[deadline_type],
            DATEDIFF(DAY, @today, rd.[deadline_date]) AS days_left
        FROM [dbo].[deadline_actions] da
        JOIN [dbo].[round_deadlines] rd ON rd.[id] = da.[deadline_id]
        WHERE da.[executed_at] >= DATEADD(MINUTE, -5, @now)
          AND da.[action_type] IN ('reminder_3d', 'reminder_1d')
    )
    INSERT INTO [dbo].[notifications]
        ([id], [user_id], [type], [title], [message], [ref_id], [ref_type])
    SELECT
        'NTF' + FORMAT(@now, 'yyyyMMddHHmmss')
              + RIGHT('00000' + CAST(ROW_NUMBER() OVER (ORDER BY tm.[user_id]) AS VARCHAR(5)), 5),
        tm.[user_id],
        'deadline_reminder',
        N'Hạn ' + ra.dl_name + N' còn ' + CAST(ra.days_left AS NVARCHAR(3)) + N' ngày',
        N'Hạn ' + ra.dl_name + N' còn ' + CAST(ra.days_left AS NVARCHAR(3))
            + N' ngày (đến ' + FORMAT(ra.[deadline_date], 'dd/MM/yyyy') + N').',
        t.[id], 'topic'
    FROM recent_actions ra
    JOIN [dbo].[topics] t ON t.[round_id] = ra.[round_id]
                          AND t.[status] NOT IN ('rejected', 'cancelled')
    JOIN [dbo].[topic_members] tm ON tm.[topic_id] = t.[id]
                                  AND tm.[role]    = 'principal_investigator'
                                  AND tm.[user_id] IS NOT NULL
    WHERE NOT EXISTS (
        SELECT 1 FROM [dbo].[notifications] n
        WHERE n.[user_id]    = tm.[user_id]
          AND n.[ref_id]     = t.[id]
          AND n.[type]       = 'deadline_reminder'
          AND n.[created_at] >= DATEADD(HOUR, -24, @now)
    );

    -- --------------------------------------------------------
    -- B. Tự động đóng cửa sổ supplement
    -- --------------------------------------------------------
    UPDATE [dbo].[topics]
    SET [status] = 'approved', [updated_at] = @now
    WHERE [status] = 'supplement'
      AND [round_id] IN (
          SELECT rd.[round_id]
          FROM [dbo].[round_deadlines] rd
          WHERE rd.[deadline_type] = 'supplement'
            AND rd.[deadline_date] < @today
      );

    -- Ghi deadline_action auto_close
    INSERT INTO [dbo].[deadline_actions]
        ([id], [deadline_id], [action_type], [is_executed], [executed_at])
    SELECT
        'DA' + FORMAT(
            ROW_NUMBER() OVER (ORDER BY rd.[id])
            + ISNULL((SELECT MAX(CAST(SUBSTRING([id],3,18) AS BIGINT))
                      FROM [dbo].[deadline_actions] WHERE [id] LIKE 'DA%'), 0),
            '000000000000000000'),
        rd.[id], 'auto_close', 1, @now
    FROM [dbo].[round_deadlines] rd
    WHERE rd.[deadline_type] IN ('supplement', 'registration', 'report_submission', 'council_submission')
      AND rd.[deadline_date] < @today
      AND NOT EXISTS (
          SELECT 1 FROM [dbo].[deadline_actions] da
          WHERE da.[deadline_id] = rd.[id] AND da.[action_type] = 'auto_close'
      );

    -- --------------------------------------------------------
    -- C. Cleanup các job định kỳ khác
    -- --------------------------------------------------------
    EXEC [dbo].[sp_cleanup_expired_tokens];
    EXEC [dbo].[sp_deactivate_expired_accounts];

    -- Xóa thông báo cũ: đã đọc sau 90 ngày, chưa đọc sau 180 ngày
    EXEC [dbo].[sp_cleanup_old_notifications]
        @read_retention_days   = 90,
        @unread_retention_days = 180,
        @batch_size            = 500;
END;
