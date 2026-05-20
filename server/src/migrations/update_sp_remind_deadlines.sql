USE [RMS_HOSPITAL];
GO

-- ============================================================
-- Migration: Cập nhật sp_remind_deadlines
--   1. Giữ nhắc hạn nộp tổng theo end_date của đợt (@days_ahead)
--   2. Thêm: thông báo khi round_deadline bắt đầu (start_date = hôm nay)
--   3. Thêm: nhắc trước 1 ngày deadline của từng round_deadline
--   4. Thêm: nhắc trước 1 ngày supplement_end_date
-- ============================================================

ALTER PROCEDURE [dbo].[sp_remind_deadlines]
    @days_ahead INT = 3
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @topic_id  VARCHAR(15);
    DECLARE @deadline  DATE;
    DECLARE @title     NVARCHAR(255);
    DECLARE @user_ids  NVARCHAR(MAX);

    -- ── 1. Nhắc hạn nộp tổng theo end_date của đợt ───────────────────────────
    DECLARE dc CURSOR LOCAL FAST_FORWARD FOR
        SELECT DISTINCT t.id, CAST(r.end_date AS DATE)
        FROM   dbo.topics t
        JOIN   dbo.research_rounds r ON r.id = t.round_id
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
            SELECT t2.created_by AS uid FROM dbo.topics t2 WHERE t2.id = @topic_id
            UNION
            SELECT tm.user_id FROM dbo.topic_members tm
            WHERE  tm.topic_id = @topic_id AND tm.user_id IS NOT NULL
        ) x;

        IF @user_ids IS NOT NULL AND @user_ids <> '[]'
            EXEC dbo.sp_push_notification
                @type     = 'deadline_reminder',
                @title    = @title,
                @ref_id   = @topic_id,
                @ref_type = 'topic',
                @user_ids = @user_ids;

        FETCH NEXT FROM dc INTO @topic_id, @deadline;
    END
    CLOSE dc;
    DEALLOCATE dc;

    -- ── 2. Thông báo khi round_deadline bắt đầu (start_date = hôm nay) ────────
    DECLARE @rd_round_id VARCHAR(10);
    DECLARE @rd_name     NVARCHAR(255);

    DECLARE rd_open CURSOR LOCAL FAST_FORWARD FOR
        SELECT rd.round_id, rd.name
        FROM   dbo.round_deadlines rd
        WHERE  rd.start_date = CAST(GETDATE() AS DATE);

    OPEN rd_open;
    FETCH NEXT FROM rd_open INTO @rd_round_id, @rd_name;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @title = N'Hạn nộp đã bắt đầu: ' + @rd_name;

        DECLARE topic_open CURSOR LOCAL FAST_FORWARD FOR
            SELECT t.id FROM dbo.topics t
            WHERE  t.round_id = @rd_round_id
              AND  t.status IN ('approved', 'submitted', 'in_progress');

        OPEN topic_open;
        FETCH NEXT FROM topic_open INTO @topic_id;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            SELECT @user_ids = '[' + STRING_AGG('"' + uid + '"', ',') + ']'
            FROM (
                SELECT t2.created_by AS uid FROM dbo.topics t2 WHERE t2.id = @topic_id
                UNION
                SELECT tm.user_id FROM dbo.topic_members tm
                WHERE  tm.topic_id = @topic_id AND tm.user_id IS NOT NULL
            ) x;

            IF @user_ids IS NOT NULL AND @user_ids <> '[]'
                EXEC dbo.sp_push_notification
                    @type     = 'deadline_opened',
                    @title    = @title,
                    @ref_id   = @topic_id,
                    @ref_type = 'topic',
                    @user_ids = @user_ids;

            FETCH NEXT FROM topic_open INTO @topic_id;
        END
        CLOSE topic_open;
        DEALLOCATE topic_open;

        FETCH NEXT FROM rd_open INTO @rd_round_id, @rd_name;
    END
    CLOSE rd_open;
    DEALLOCATE rd_open;

    -- ── 3. Nhắc trước 1 ngày trước khi deadline của từng round_deadline ────────
    DECLARE rd_soon CURSOR LOCAL FAST_FORWARD FOR
        SELECT rd.round_id, rd.name, CAST(rd.deadline_date AS DATE)
        FROM   dbo.round_deadlines rd
        WHERE  DATEDIFF(DAY, CAST(GETDATE() AS DATE), CAST(rd.deadline_date AS DATE)) = 1;

    OPEN rd_soon;
    FETCH NEXT FROM rd_soon INTO @rd_round_id, @rd_name, @deadline;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @title = N'Nhắc nhở: ' + @rd_name + N' còn 1 ngày ('
                   + CONVERT(NVARCHAR(10), @deadline, 103) + N')';

        DECLARE topic_soon CURSOR LOCAL FAST_FORWARD FOR
            SELECT t.id FROM dbo.topics t
            WHERE  t.round_id = @rd_round_id
              AND  t.status IN ('approved', 'submitted', 'in_progress');

        OPEN topic_soon;
        FETCH NEXT FROM topic_soon INTO @topic_id;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            SELECT @user_ids = '[' + STRING_AGG('"' + uid + '"', ',') + ']'
            FROM (
                SELECT t2.created_by AS uid FROM dbo.topics t2 WHERE t2.id = @topic_id
                UNION
                SELECT tm.user_id FROM dbo.topic_members tm
                WHERE  tm.topic_id = @topic_id AND tm.user_id IS NOT NULL
            ) x;

            IF @user_ids IS NOT NULL AND @user_ids <> '[]'
                EXEC dbo.sp_push_notification
                    @type     = 'deadline_reminder',
                    @title    = @title,
                    @ref_id   = @topic_id,
                    @ref_type = 'topic',
                    @user_ids = @user_ids;

            FETCH NEXT FROM topic_soon INTO @topic_id;
        END
        CLOSE topic_soon;
        DEALLOCATE topic_soon;

        FETCH NEXT FROM rd_soon INTO @rd_round_id, @rd_name, @deadline;
    END
    CLOSE rd_soon;
    DEALLOCATE rd_soon;

    -- ── 4. Nhắc trước 1 ngày trước khi supplement_end_date ───────────────────
    DECLARE @supp_end DATE;

    DECLARE supp CURSOR LOCAL FAST_FORWARD FOR
        SELECT t.id, CAST(rr.supplement_end_date AS DATE)
        FROM   dbo.topics t
        JOIN   dbo.research_rounds rr ON rr.id = t.round_id
        WHERE  t.status = 'supplement'
          AND  DATEDIFF(DAY, CAST(GETDATE() AS DATE), CAST(rr.supplement_end_date AS DATE)) = 1;

    OPEN supp;
    FETCH NEXT FROM supp INTO @topic_id, @supp_end;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @title = N'Đợt bổ sung thông tin còn 1 ngày ('
                   + CONVERT(NVARCHAR(10), @supp_end, 103) + N')';

        SELECT @user_ids = '[' + STRING_AGG('"' + uid + '"', ',') + ']'
        FROM (
            SELECT t2.created_by AS uid FROM dbo.topics t2 WHERE t2.id = @topic_id
            UNION
            SELECT tm.user_id FROM dbo.topic_members tm
            WHERE  tm.topic_id = @topic_id AND tm.user_id IS NOT NULL
        ) x;

        IF @user_ids IS NOT NULL AND @user_ids <> '[]'
            EXEC dbo.sp_push_notification
                @type     = 'supplement_reminder',
                @title    = @title,
                @ref_id   = @topic_id,
                @ref_type = 'topic',
                @user_ids = @user_ids;

        FETCH NEXT FROM supp INTO @topic_id, @supp_end;
    END
    CLOSE supp;
    DEALLOCATE supp;

END;
GO

PRINT 'sp_remind_deadlines updated successfully.';
