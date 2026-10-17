-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
-- 4d. sp_grant_member_accounts: bỏ cột account_type khỏi INSERT users
CREATE   PROCEDURE [dbo].[sp_grant_member_accounts]
    @topic_id   VARCHAR(15),
    @actor_id   VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    EXEC sp_set_session_context N'current_user_id', @actor_id;

    IF NOT EXISTS (SELECT 1 FROM [dbo].[topics] WHERE [id] = @topic_id)
    BEGIN
        RAISERROR(N'Đề tài %s không tồn tại', 16, 1, @topic_id);
        RETURN;
    END

    DECLARE @new_expires DATE;
    SELECT @new_expires = rr.[end_date]
    FROM   [dbo].[topics] t
    JOIN   [dbo].[research_rounds] rr ON rr.[id] = t.[round_id]
    WHERE  t.[id] = @topic_id;

    DECLARE @topic_dept_id   VARCHAR(20),
            @topic_dept_code VARCHAR(20);
    SELECT @topic_dept_id   = t.[department_id],
           @topic_dept_code = d.[code]
    FROM   [dbo].[topics] t
    JOIN   [dbo].[departments] d ON d.[id] = t.[department_id]
    WHERE  t.[id] = @topic_id;

    DECLARE @newly_granted TABLE ([user_id] VARCHAR(20), [is_new_account] BIT);

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
            SELECT [id], [name], [email], [staff_number], [department_id]
            FROM   [dbo].[topic_members]
            WHERE  [topic_id]       = @topic_id
              AND  [account_granted] = 0
              AND  [email]           IS NOT NULL;

        OPEN mc;
        FETCH NEXT FROM mc INTO @member_id, @name, @email, @staff_number, @member_dept;

        WHILE @@FETCH_STATUS = 0
        BEGIN
            SELECT @dept_id = COALESCE(
                (SELECT [department_id] FROM [dbo].[users] WHERE [staff_number] = @staff_number),
                @member_dept,
                @topic_dept_id
            );
            SELECT @dept_code = ISNULL(
                (SELECT [code] FROM [dbo].[departments] WHERE [id] = @dept_id),
                @topic_dept_code
            );

            SET @exist_uid = NULL;
            SELECT @exist_uid = [id] FROM [dbo].[users] WHERE [email] = @email;

            IF @exist_uid IS NOT NULL
            BEGIN
                UPDATE [dbo].[users]
                SET    [is_active]          = 1,
                       [account_expires_at] = @new_expires,
                       [updated_at]         = GETDATE(),
                       [updated_by]         = @actor_id
                WHERE  [id] = @exist_uid;

                UPDATE [dbo].[topic_members]
                SET    [user_id]            = @exist_uid,
                       [account_granted]    = 1,
                       [account_granted_at] = GETDATE()
                WHERE  [id] = @member_id;

                INSERT INTO @newly_granted VALUES (@exist_uid, 0);
            END
            ELSE
            BEGIN
                EXEC [dbo].[sp_gen_user_id] @dept_code, 0, @new_uid OUTPUT;

                SET @new_uname = LEFT(@email, CHARINDEX('@', @email) - 1);
                IF EXISTS (SELECT 1 FROM [dbo].[users] WHERE [username] = @new_uname)
                    SET @new_uname = @new_uname + '_' + RIGHT(@new_uid, 4);

                INSERT INTO [dbo].[users]
                    ([id], [username], [password], [full_name], [email],
                     [department_id], [role_id],
                     [account_expires_at], [topic_member_id], [created_by])
                VALUES
                    (@new_uid, @new_uname, '$2b$12$TEMP_MUST_CHANGE',
                     @name, @email,
                     @dept_id, 'VT06',
                     @new_expires, @member_id, @actor_id);

                UPDATE [dbo].[topic_members]
                SET    [user_id]            = @new_uid,
                       [account_granted]    = 1,
                       [account_granted_at] = GETDATE()
                WHERE  [id] = @member_id;

                INSERT INTO @newly_granted VALUES (@new_uid, 1);
            END

            FETCH NEXT FROM mc INTO @member_id, @name, @email, @staff_number, @member_dept;
        END
        CLOSE mc; DEALLOCATE mc;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF CURSOR_STATUS('local', 'mc') >= 0 BEGIN CLOSE mc; DEALLOCATE mc; END
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH

    DECLARE @uid       VARCHAR(20),
            @is_new    BIT,
            @uid_json  NVARCHAR(MAX);

    DECLARE nc CURSOR LOCAL FAST_FORWARD FOR
        SELECT [user_id], [is_new_account] FROM @newly_granted;

    OPEN nc;
    FETCH NEXT FROM nc INTO @uid, @is_new;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @uid_json = '["' + @uid + '"]';

        DECLARE @account_msg NVARCHAR(MAX);
        IF @is_new = 1
            SET @account_msg = N'Tài khoản đã được cấp để tham gia đề tài NCKH. Vui lòng đăng nhập với mật khẩu mặc định (123456) và đổi mật khẩu ngay.';
        ELSE
            SET @account_msg = N'Tài khoản của bạn đã được kích hoạt lại để tham gia đề tài NCKH. Bạn có thể đăng nhập ngay với mật khẩu hiện tại.';

        DECLARE @account_title NVARCHAR(255);
        IF @is_new = 1
            SET @account_title = N'Tài khoản hệ thống đã được cấp';
        ELSE
            SET @account_title = N'Tài khoản đã được kích hoạt lại';

        EXEC [dbo].[sp_push_notification]
            @type     = 'account_granted',
            @title    = @account_title,
            @message  = @account_msg,
            @ref_id   = @topic_id,
            @ref_type = 'topic',
            @user_ids = @uid_json;

        FETCH NEXT FROM nc INTO @uid, @is_new;
    END
    CLOSE nc; DEALLOCATE nc;

    SELECT u.[id], u.[username], u.[full_name], u.[email], tm.[role]
    FROM   [dbo].[users] u
    JOIN   [dbo].[topic_members] tm ON tm.[user_id] = u.[id]
    JOIN   @newly_granted ng         ON ng.[user_id] = u.[id]
    WHERE  tm.[topic_id] = @topic_id;
END;
