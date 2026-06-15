USE [RMS_HOSPITAL];
GO

-- ============================================================
-- Migration: Đổi định dạng mã đề tài thành LOẠI_NĂM_STT
-- Ví dụ: NCKH_2025_001, SK_2025_001, BCHH_2025_001
-- Ghi chú: Dữ liệu cũ giữ nguyên; định dạng mới áp dụng cho
--          đề tài tạo sau khi chạy migration này.
-- ============================================================

-- ── Bước 1: Thêm cột viết tắt (abbr) vào bảng categories ───
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE  object_id = OBJECT_ID('dbo.categories') AND name = 'abbr'
)
    ALTER TABLE dbo.categories ADD abbr VARCHAR(10) NULL;
GO

UPDATE dbo.categories SET abbr = 'NCKH' WHERE id = 'LDT01' AND abbr IS NULL;
UPDATE dbo.categories SET abbr = 'SK'   WHERE id = 'LDT02' AND abbr IS NULL;
UPDATE dbo.categories SET abbr = 'ST'   WHERE id = 'LDT03' AND abbr IS NULL;
UPDATE dbo.categories SET abbr = 'BCHH' WHERE id = 'LDT04' AND abbr IS NULL;
UPDATE dbo.categories SET abbr = 'BB'   WHERE id = 'LDT05' AND abbr IS NULL;
GO

-- ── Bước 2: Xóa FK constraints trỏ vào topics(id) ──────────
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ap_topic'    AND parent_object_id = OBJECT_ID('dbo.approvals'))
    ALTER TABLE dbo.approvals     DROP CONSTRAINT FK_ap_topic;
GO
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_batch_topic'  AND parent_object_id = OBJECT_ID('dbo.file_batches'))
    ALTER TABLE dbo.file_batches  DROP CONSTRAINT FK_batch_topic;
GO
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_file_topic'   AND parent_object_id = OBJECT_ID('dbo.files'))
    ALTER TABLE dbo.files         DROP CONSTRAINT FK_file_topic;
GO
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_tm_topic'     AND parent_object_id = OBJECT_ID('dbo.topic_members'))
    ALTER TABLE dbo.topic_members DROP CONSTRAINT FK_tm_topic;
GO
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_tp_topic'     AND parent_object_id = OBJECT_ID('dbo.topic_progress'))
    ALTER TABLE dbo.topic_progress DROP CONSTRAINT FK_tp_topic;
GO

-- ── Bước 3: Mở rộng cột id / topic_id từ 12 lên 15 ─────────
ALTER TABLE dbo.topics         ALTER COLUMN id       VARCHAR(15) NOT NULL;
GO
ALTER TABLE dbo.approvals      ALTER COLUMN topic_id VARCHAR(15) NOT NULL;
ALTER TABLE dbo.file_batches   ALTER COLUMN topic_id VARCHAR(15) NOT NULL;
ALTER TABLE dbo.files          ALTER COLUMN topic_id VARCHAR(15) NOT NULL;
ALTER TABLE dbo.topic_members  ALTER COLUMN topic_id VARCHAR(15) NOT NULL;
ALTER TABLE dbo.topic_progress ALTER COLUMN topic_id VARCHAR(15) NOT NULL;
GO

-- ── Bước 4: Tạo lại FK constraints ──────────────────────────
ALTER TABLE dbo.approvals
    ADD CONSTRAINT FK_ap_topic FOREIGN KEY (topic_id)
    REFERENCES dbo.topics (id) ON DELETE CASCADE;
GO
ALTER TABLE dbo.file_batches
    ADD CONSTRAINT FK_batch_topic FOREIGN KEY (topic_id)
    REFERENCES dbo.topics (id) ON DELETE CASCADE;
GO
ALTER TABLE dbo.files
    ADD CONSTRAINT FK_file_topic FOREIGN KEY (topic_id)
    REFERENCES dbo.topics (id) ON DELETE CASCADE;
GO
ALTER TABLE dbo.topic_members
    ADD CONSTRAINT FK_tm_topic FOREIGN KEY (topic_id)
    REFERENCES dbo.topics (id) ON DELETE CASCADE;
GO
ALTER TABLE dbo.topic_progress
    ADD CONSTRAINT FK_tp_topic FOREIGN KEY (topic_id)
    REFERENCES dbo.topics (id) ON DELETE CASCADE;
GO

-- ── Bước 5: sp_gen_topic_id – định dạng mới ─────────────────
-- Định dạng mới: {ABBR}_{YEAR}_{NNN}  (vd: NCKH_2025_001)
-- Tham số:
--   @category_id  VARCHAR(6)  – mã loại đề tài (LDT01…)
--   @round_id     VARCHAR(10) – mã đợt nghiên cứu (DOT20251…)
--   @new_id       VARCHAR(15) OUTPUT
ALTER PROCEDURE [dbo].[sp_gen_topic_id]
    @category_id VARCHAR(6),
    @round_id    VARCHAR(10),
    @new_id      VARCHAR(15) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @abbr VARCHAR(10);
    SELECT @abbr = abbr FROM dbo.categories WHERE id = @category_id;
    IF @abbr IS NULL
        RAISERROR(N'Loại đề tài %s không hợp lệ hoặc chưa có ký hiệu viết tắt', 16, 1, @category_id);

    DECLARE @year INT;
    SELECT @year = year FROM dbo.research_rounds WHERE id = @round_id;
    IF @year IS NULL
        RAISERROR(N'Đợt nghiên cứu %s không tồn tại', 16, 1, @round_id);

    -- Tiền tố: vd. "NCKH_2025_" (max 10 ký tự)
    DECLARE @prefix VARCHAR(11) = @abbr + '_' + CAST(@year AS VARCHAR(4)) + '_';

    DECLARE @count INT;
    SELECT @count = COUNT(*) + 1
    FROM   dbo.topics t
    JOIN   dbo.research_rounds r ON r.id = t.round_id
    WHERE  t.category_id = @category_id
      AND  r.year        = @year;

    SET @new_id = @prefix + RIGHT('000' + CAST(@count AS VARCHAR(3)), 3);
    WHILE EXISTS (SELECT 1 FROM dbo.topics WHERE id = @new_id)
    BEGIN
        SET @count += 1;
        SET @new_id = @prefix + RIGHT('000' + CAST(@count AS VARCHAR(3)), 3);
    END
END;
GO

-- ── Bước 6: Cập nhật tham số @topic_id của các SP liên quan ─

ALTER PROCEDURE [dbo].[sp_gen_batch_id]
    @topic_id VARCHAR(15), @new_id VARCHAR(30) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ds     VARCHAR(8)  = CONVERT(VARCHAR(8), GETDATE(), 112);
    DECLARE @prefix VARCHAR(28) = 'BATCH' + @topic_id + @ds;
    DECLARE @count  INT;
    SELECT @count = COUNT(*) + 1 FROM dbo.file_batches WHERE id LIKE @prefix + '%';
    SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
    WHILE EXISTS (SELECT 1 FROM dbo.file_batches WHERE id = @new_id)
    BEGIN SET @count += 1; SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2); END
END;
GO

ALTER PROCEDURE [dbo].[sp_gen_file_id]
    @topic_id VARCHAR(15), @new_id VARCHAR(32) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ds     VARCHAR(8)  = CONVERT(VARCHAR(8), GETDATE(), 112);
    DECLARE @prefix VARCHAR(26) = 'FILE' + @topic_id + @ds;
    DECLARE @count  INT;
    SELECT @count = COUNT(*) + 1 FROM dbo.files WHERE topic_id = @topic_id AND id LIKE @prefix + '%';
    SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
    WHILE EXISTS (SELECT 1 FROM dbo.files WHERE id = @new_id)
    BEGIN SET @count += 1; SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2); END
END;
GO

ALTER PROCEDURE [dbo].[sp_gen_member_id]
    @topic_id VARCHAR(15), @new_id VARCHAR(22) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @prefix VARCHAR(18) = 'TV' + @topic_id + '_';
    DECLARE @count  INT;
    SELECT @count = COUNT(*) + 1 FROM dbo.topic_members WHERE topic_id = @topic_id;
    SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
    WHILE EXISTS (SELECT 1 FROM dbo.topic_members WHERE id = @new_id)
    BEGIN SET @count += 1; SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2); END
END;
GO

ALTER PROCEDURE [dbo].[sp_gen_progress_id]
    @topic_id VARCHAR(15),
    @new_id   VARCHAR(22) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @prefix VARCHAR(16) = 'TP' + @topic_id + '_';
    DECLARE @count  INT;
    SELECT @count = COUNT(*) + 1 FROM dbo.topic_progress WHERE topic_id = @topic_id;
    SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
    WHILE EXISTS (SELECT 1 FROM dbo.topic_progress WHERE id = @new_id)
    BEGIN
        SET @count += 1;
        SET @new_id = @prefix + RIGHT('00' + CAST(@count AS VARCHAR(2)), 2);
    END
END;
GO

ALTER PROCEDURE [dbo].[sp_approve_topic]
    @topic_id   VARCHAR(15),
    @actor_id   VARCHAR(20),
    @decision   VARCHAR(10),
    @comment    NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @decision NOT IN ('approved','rejected')
        RAISERROR(N'Quyết định không hợp lệ', 16, 1);

    EXEC sp_set_session_context N'current_user_id', @actor_id;

    BEGIN TRANSACTION;
    BEGIN TRY
        UPDATE dbo.approvals
        SET    status  = @decision,
               comment = @comment
        WHERE  topic_id = @topic_id;

        IF @@ROWCOUNT = 0
            RAISERROR(N'Không tìm thấy bản ghi phê duyệt cho đề tài %s', 16, 1, @topic_id);

        UPDATE dbo.topics SET status = @decision WHERE id = @topic_id;

        DECLARE @prog_id     VARCHAR(22);
        DECLARE @prog_prefix VARCHAR(18) = 'TT' + @topic_id + '_';
        DECLARE @prog_count  INT;
        SELECT @prog_count = COUNT(*) + 1 FROM dbo.topic_progress WHERE topic_id = @topic_id;
        SET @prog_id = @prog_prefix + RIGHT('00' + CAST(@prog_count AS VARCHAR(2)), 2);

        INSERT INTO dbo.topic_progress (id, topic_id, status, note, created_by)
        VALUES (
            @prog_id, @topic_id,
            CASE @decision WHEN 'approved' THEN N'Đề tài được phê duyệt'
                           ELSE N'Đề tài bị từ chối' END,
            @comment,
            @actor_id
        );

        COMMIT TRANSACTION;

        IF @decision = 'approved'
            EXEC dbo.sp_grant_member_accounts @topic_id, @actor_id;

        SELECT N'Thành công' AS message, @topic_id AS topic_id, @decision AS decision;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION; THROW;
    END CATCH
END;
GO

ALTER PROCEDURE [dbo].[sp_grant_member_accounts]
    @topic_id   VARCHAR(15),
    @actor_id   VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    EXEC sp_set_session_context N'current_user_id', @actor_id;

    IF NOT EXISTS (SELECT 1 FROM dbo.topics WHERE id = @topic_id)
    BEGIN
        RAISERROR(N'Đề tài %s không tồn tại', 16, 1, @topic_id);
        RETURN;
    END

    DECLARE @new_expires DATE;
    SELECT @new_expires = rr.end_date
    FROM dbo.topics t
    JOIN dbo.research_rounds rr ON rr.id = t.round_id
    WHERE t.id = @topic_id;

    DECLARE @topic_dept_id   VARCHAR(20),
            @topic_dept_code VARCHAR(20);
    SELECT @topic_dept_id = t.department_id, @topic_dept_code = d.code
    FROM dbo.topics t
    JOIN dbo.departments d ON d.id = t.department_id
    WHERE t.id = @topic_id;

    DECLARE @newly_granted TABLE (user_id VARCHAR(20));

    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @member_id    VARCHAR(22),
                @name         NVARCHAR(255),
                @email        VARCHAR(255),
                @staff_number VARCHAR(50),
                @member_dept  VARCHAR(20),
                @dept_id      VARCHAR(20),
                @dept_code    VARCHAR(20),
                @new_uid      VARCHAR(20),
                @new_uname    VARCHAR(100),
                @exist_uid    VARCHAR(20);

        DECLARE mc CURSOR FOR
        SELECT tm.id, tm.name, tm.email, tm.staff_number, tm.department_id
        FROM dbo.topic_members tm
        WHERE tm.topic_id = @topic_id
          AND tm.account_granted = 0
          AND tm.email IS NOT NULL;

        OPEN mc;
        FETCH NEXT FROM mc INTO @member_id, @name, @email, @staff_number, @member_dept;

        WHILE @@FETCH_STATUS = 0
        BEGIN
            SELECT @dept_id = COALESCE(
                (SELECT u.department_id FROM dbo.users u WHERE u.staff_number = @staff_number),
                @member_dept,
                @topic_dept_id
            );
            SELECT @dept_code = ISNULL(
                (SELECT d.code FROM dbo.departments d WHERE d.id = @dept_id),
                @topic_dept_code
            );

            SET @exist_uid = NULL;
            SELECT @exist_uid = id FROM dbo.users WHERE email = @email;

            IF @exist_uid IS NOT NULL
            BEGIN
                UPDATE dbo.users
                SET is_active          = 1,
                    account_expires_at = @new_expires,
                    updated_at         = GETDATE(),
                    updated_by         = @actor_id
                WHERE id = @exist_uid;

                UPDATE dbo.topic_members
                SET user_id            = @exist_uid,
                    account_granted    = 1,
                    account_granted_at = GETDATE()
                WHERE id = @member_id;

                INSERT INTO @newly_granted VALUES (@exist_uid);
            END
            ELSE
            BEGIN
                EXEC dbo.sp_gen_user_id @dept_code, 0, @new_uid OUTPUT;
                SET @new_uname = LEFT(@email, CHARINDEX('@', @email) - 1);
                IF EXISTS (SELECT 1 FROM dbo.users WHERE username = @new_uname)
                    SET @new_uname = @new_uname + '_' + RIGHT(@new_uid, 4);

                INSERT INTO dbo.users
                    (id, username, password, full_name, email,
                     department_id, role_id, account_type,
                     account_expires_at, topic_member_id, created_by)
                VALUES
                    (@new_uid, @new_uname, '$2b$12$TEMP_MUST_CHANGE',
                     @name, @email,
                     @dept_id, 'VT06', 'member',
                     @new_expires, @member_id, @actor_id);

                UPDATE dbo.topic_members
                SET user_id            = @new_uid,
                    account_granted    = 1,
                    account_granted_at = GETDATE()
                WHERE id = @member_id;

                INSERT INTO @newly_granted VALUES (@new_uid);
            END

            FETCH NEXT FROM mc INTO @member_id, @name, @email, @staff_number, @member_dept;
        END
        CLOSE mc; DEALLOCATE mc;

        COMMIT TRANSACTION;

        SELECT u.id, u.username, u.full_name, u.email, tm.role
        FROM dbo.users u
        JOIN dbo.topic_members tm ON tm.user_id = u.id
        JOIN @newly_granted ng ON ng.user_id = u.id
        WHERE tm.topic_id = @topic_id;

    END TRY
    BEGIN CATCH
        IF CURSOR_STATUS('local', 'mc') >= 0 BEGIN CLOSE mc; DEALLOCATE mc; END
        ROLLBACK TRANSACTION; THROW;
    END CATCH
END;
GO

ALTER PROCEDURE [dbo].[sp_upload_files]
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

        DECLARE @file_name    NVARCHAR(500), @file_url   VARCHAR(1000),
                @file_size    BIGINT,        @mime_type  VARCHAR(100),
                @file_desc    NVARCHAR(MAX), @file_id    VARCHAR(32);

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
        IF CURSOR_STATUS('local','fc') >= 0 BEGIN CLOSE fc; DEALLOCATE fc; END
        ROLLBACK TRANSACTION; THROW;
    END CATCH
END;
GO

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

    IF NOT EXISTS (SELECT 1 FROM [dbo].[research_rounds] WHERE [id] = @round_id)
    BEGIN
        RAISERROR(N'Đợt nghiên cứu %s không tồn tại.', 16, 1, @round_id);
        RETURN;
    END

    IF @supplement_end < @supplement_start
    BEGIN
        RAISERROR(N'Ngày kết thúc bổ sung phải >= ngày bắt đầu bổ sung.', 16, 1);
        RETURN;
    END

    DECLARE @affected_topics TABLE ([topic_id] VARCHAR(15));

    BEGIN TRANSACTION;
    BEGIN TRY

        UPDATE [dbo].[research_rounds]
        SET    [supplement_start_date] = @supplement_start,
               [supplement_end_date]   = @supplement_end,
               [updated_at]            = GETDATE(),
               [updated_by]            = @actor_id
        WHERE  [id] = @round_id;

        UPDATE [dbo].[topics]
        SET    [status]     = 'supplement',
               [updated_at] = GETDATE(),
               [updated_by] = @actor_id
        OUTPUT INSERTED.[id] INTO @affected_topics([topic_id])
        WHERE  [round_id] = @round_id
          AND  [status]   = 'approved';

        DECLARE @topics_opened INT = @@ROWCOUNT;

        COMMIT TRANSACTION;

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

        SELECT @topics_opened AS [topics_opened];

    END TRY
    BEGIN CATCH
        IF CURSOR_STATUS('local', 'tc') >= 0 BEGIN CLOSE tc; DEALLOCATE tc; END
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

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
GO

ALTER PROCEDURE [dbo].[sp_remind_deadlines]
    @days_ahead INT = 3
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @topic_id   VARCHAR(15);
    DECLARE @deadline   DATE;
    DECLARE @title      NVARCHAR(255);
    DECLARE @user_ids   NVARCHAR(MAX);

    DECLARE dc CURSOR LOCAL FAST_FORWARD FOR
        SELECT DISTINCT t.id, CAST(r.end_date AS DATE) AS deadline
        FROM       dbo.topics t
        JOIN       dbo.research_rounds r ON r.id = t.round_id
        WHERE      t.status IN ('approved', 'submitted')
            AND    DATEDIFF(DAY, CAST(GETDATE() AS DATE), CAST(r.end_date AS DATE)) = @days_ahead;

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
END;
GO

PRINT 'Migration change_topic_id_format complete.';
