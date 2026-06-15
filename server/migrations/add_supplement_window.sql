USE [RMS_HOSPITAL];
GO

-- ============================================================
-- Migration: Thêm cửa sổ bổ sung (supplement window) vào đợt
--            nghiên cứu và các stored procedure quản lý nó
-- ============================================================

-- ─── 1. Cột supplement_start_date / supplement_end_date ──────────────────────
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE  object_id = OBJECT_ID('dbo.research_rounds')
      AND  name = 'supplement_start_date'
)
BEGIN
    ALTER TABLE [dbo].[research_rounds]
        ADD [supplement_start_date] DATE NULL,
            [supplement_end_date]   DATE NULL;
    PRINT 'Added columns: supplement_start_date, supplement_end_date';
END
GO

-- ─── 2. Ràng buộc ngày hợp lệ ────────────────────────────────────────────────
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE  name = 'CHK_rr_supplement_dates'
      AND  parent_object_id = OBJECT_ID('dbo.research_rounds')
)
BEGIN
    ALTER TABLE [dbo].[research_rounds]
        ADD CONSTRAINT [CHK_rr_supplement_dates] CHECK (
            [supplement_start_date] IS NULL
            OR [supplement_end_date]   IS NULL
            OR [supplement_end_date]  >= [supplement_start_date]
        );
    PRINT 'Added constraint: CHK_rr_supplement_dates';
END
GO

-- ─── 3. sp_open_supplement_window ────────────────────────────────────────────
-- Mở cửa sổ bổ sung cho một đợt:
--   • Ghi supplement_start_date / supplement_end_date vào research_rounds
--   • Chuyển tất cả đề tài 'approved' trong đợt thành 'supplement'
--   • Gửi thông báo đến chủ nhiệm và thành viên của các đề tài liên quan
IF OBJECT_ID('dbo.sp_open_supplement_window', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[sp_open_supplement_window];
GO
CREATE PROCEDURE [dbo].[sp_open_supplement_window]
    @round_id         VARCHAR(10),
    @actor_id         VARCHAR(20),
    @supplement_start DATE,
    @supplement_end   DATE
AS
BEGIN
    SET NOCOUNT ON;
    EXEC sp_set_session_context N'current_user_id', @actor_id;

    -- Kiểm tra đợt tồn tại
    IF NOT EXISTS (SELECT 1 FROM [dbo].[research_rounds] WHERE [id] = @round_id)
    BEGIN
        RAISERROR(N'Đợt nghiên cứu %s không tồn tại.', 16, 1, @round_id);
        RETURN;
    END

    -- Kiểm tra ngày hợp lệ
    IF @supplement_end < @supplement_start
    BEGIN
        RAISERROR(N'Ngày kết thúc bổ sung phải >= ngày bắt đầu bổ sung.', 16, 1);
        RETURN;
    END

    -- Tập hợp các đề tài sẽ được chuyển trạng thái (để gửi thông báo sau)
    DECLARE @affected_topics TABLE ([topic_id] VARCHAR(15));

    BEGIN TRANSACTION;
    BEGIN TRY

        -- Cập nhật cửa sổ thời gian trên đợt nghiên cứu
        UPDATE [dbo].[research_rounds]
        SET    [supplement_start_date] = @supplement_start,
               [supplement_end_date]   = @supplement_end,
               [updated_at]            = GETDATE(),
               [updated_by]            = @actor_id
        WHERE  [id] = @round_id;

        -- Chuyển tất cả đề tài 'approved' → 'supplement'
        UPDATE [dbo].[topics]
        SET    [status]     = 'supplement',
               [updated_at] = GETDATE(),
               [updated_by] = @actor_id
        OUTPUT INSERTED.[id] INTO @affected_topics([topic_id])
        WHERE  [round_id] = @round_id
          AND  [status]   = 'approved';

        DECLARE @topics_opened INT = @@ROWCOUNT;

        COMMIT TRANSACTION;

        -- ── Thông báo ──────────────────────────────────────────────────────────
        -- Lấy danh sách người dùng liên quan đến các đề tài vừa mở
        DECLARE @topic_id  VARCHAR(15);
        DECLARE @user_ids  NVARCHAR(MAX);
        DECLARE @notif_msg NVARCHAR(255);

        SET @notif_msg = N'Đợt bổ sung thông tin mở từ '
                       + CONVERT(NVARCHAR(10), @supplement_start, 103)
                       + N' đến '
                       + CONVERT(NVARCHAR(10), @supplement_end, 103)
                       + N'. Vui lòng cập nhật thông tin đề tài.';

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
                    @type     = 'supplement_opened',
                    @title    = N'Đợt bổ sung thông tin đề tài đã mở',
                    @message  = @notif_msg,
                    @ref_id   = @topic_id,
                    @ref_type = 'topic',
                    @user_ids = @user_ids;

            FETCH NEXT FROM tc INTO @topic_id;
        END
        CLOSE tc;
        DEALLOCATE tc;

        -- Trả về số đề tài đã được mở bổ sung
        SELECT @topics_opened AS [topics_opened];

    END TRY
    BEGIN CATCH
        IF CURSOR_STATUS('local', 'tc') >= 0 BEGIN CLOSE tc; DEALLOCATE tc; END
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ─── 4. sp_close_supplement_window ───────────────────────────────────────────
-- Đóng cửa sổ bổ sung cho một đợt:
--   • Chuyển tất cả đề tài 'supplement' trong đợt trở lại 'approved'
--   • Gửi thông báo đến chủ nhiệm và thành viên
IF OBJECT_ID('dbo.sp_close_supplement_window', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[sp_close_supplement_window];
GO
CREATE PROCEDURE [dbo].[sp_close_supplement_window]
    @round_id VARCHAR(10),
    @actor_id VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    EXEC sp_set_session_context N'current_user_id', @actor_id;

    -- Kiểm tra đợt tồn tại
    IF NOT EXISTS (SELECT 1 FROM [dbo].[research_rounds] WHERE [id] = @round_id)
    BEGIN
        RAISERROR(N'Đợt nghiên cứu %s không tồn tại.', 16, 1, @round_id);
        RETURN;
    END

    DECLARE @affected_topics TABLE ([topic_id] VARCHAR(15));

    BEGIN TRANSACTION;
    BEGIN TRY

        -- Chuyển tất cả đề tài 'supplement' → 'approved'
        UPDATE [dbo].[topics]
        SET    [status]     = 'approved',
               [updated_at] = GETDATE(),
               [updated_by] = @actor_id
        OUTPUT INSERTED.[id] INTO @affected_topics([topic_id])
        WHERE  [round_id] = @round_id
          AND  [status]   = 'supplement';

        DECLARE @topics_closed INT = @@ROWCOUNT;

        COMMIT TRANSACTION;

        -- ── Thông báo ──────────────────────────────────────────────────────────
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

        -- Trả về số đề tài đã đóng bổ sung
        SELECT @topics_closed AS [topics_closed];

    END TRY
    BEGIN CATCH
        IF CURSOR_STATUS('local', 'tc') >= 0 BEGIN CLOSE tc; DEALLOCATE tc; END
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

PRINT 'Supplement window migration complete.';
