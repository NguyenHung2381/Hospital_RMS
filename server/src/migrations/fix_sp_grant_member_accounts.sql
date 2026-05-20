-- ============================================================
-- 1. Add department_id to topic_members
-- ============================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('topic_members') AND name = 'department_id'
)
BEGIN
    ALTER TABLE [dbo].[topic_members]
    ADD [department_id] VARCHAR(20) NULL
    CONSTRAINT [FK_topic_members_department]
        FOREIGN KEY REFERENCES [dbo].[departments]([id]);

    -- Backfill from existing linked user accounts
    UPDATE tm
    SET tm.department_id = u.department_id
    FROM topic_members tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.user_id IS NOT NULL;
END;
GO

-- ============================================================
-- 2. Unique index: one staff_number per topic
-- ============================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('topic_members') AND name = 'UIX_tm_topic_staff'
)
    CREATE UNIQUE INDEX [UIX_tm_topic_staff]
    ON [dbo].[topic_members] ([topic_id], [staff_number])
    WHERE [staff_number] IS NOT NULL;
GO

-- ============================================================
-- 3. Fix sp_grant_member_accounts: use member's own department
-- ============================================================
ALTER PROCEDURE [dbo].[sp_grant_member_accounts]
    @topic_id   VARCHAR(15),
    @actor_id   VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    EXEC sp_set_session_context N'current_user_id', @actor_id;

    IF NOT EXISTS (SELECT 1 FROM topics WHERE id = @topic_id)
    BEGIN
        RAISERROR(N'Đề tài %s không tồn tại', 16, 1, @topic_id);
        RETURN;
    END

    DECLARE @new_expires DATE;
    SELECT @new_expires = rr.end_date
    FROM topics t
    JOIN research_rounds rr ON rr.id = t.round_id
    WHERE t.id = @topic_id;

    -- Fallback: topic's own department
    DECLARE @topic_dept_id   VARCHAR(20),
            @topic_dept_code VARCHAR(20);
    SELECT @topic_dept_id = t.department_id, @topic_dept_code = d.code
    FROM topics t
    JOIN departments d ON d.id = t.department_id
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
        FROM topic_members tm
        WHERE tm.topic_id = @topic_id
          AND tm.account_granted = 0
          AND tm.email IS NOT NULL;

        OPEN mc;
        FETCH NEXT FROM mc INTO @member_id, @name, @email, @staff_number, @member_dept;

        WHILE @@FETCH_STATUS = 0
        BEGIN
            -- Priority: (1) existing user's dept by staff_number
            --           (2) department_id stored on topic_member
            --           (3) topic's own department
            SELECT @dept_id = COALESCE(
                (SELECT u.department_id FROM users u WHERE u.staff_number = @staff_number),
                @member_dept,
                @topic_dept_id
            );
            SELECT @dept_code = ISNULL(
                (SELECT d.code FROM departments d WHERE d.id = @dept_id),
                @topic_dept_code
            );

            SET @exist_uid = NULL;
            SELECT @exist_uid = id FROM users WHERE email = @email;

            IF @exist_uid IS NOT NULL
            BEGIN
                UPDATE users
                SET is_active          = 1,
                    account_expires_at = @new_expires,
                    updated_at         = GETDATE(),
                    updated_by         = @actor_id
                WHERE id = @exist_uid;

                UPDATE topic_members
                SET user_id            = @exist_uid,
                    account_granted    = 1,
                    account_granted_at = GETDATE()
                WHERE id = @member_id;

                INSERT INTO @newly_granted VALUES (@exist_uid);
            END
            ELSE
            BEGIN
                EXEC sp_gen_user_id @dept_code, 0, @new_uid OUTPUT;
                SET @new_uname = LEFT(@email, CHARINDEX('@', @email) - 1);
                IF EXISTS (SELECT 1 FROM users WHERE username = @new_uname)
                    SET @new_uname = @new_uname + '_' + RIGHT(@new_uid, 4);

                INSERT INTO users
                    (id, username, password, full_name, email,
                     department_id, role_id, account_type,
                     account_expires_at, topic_member_id, created_by)
                VALUES
                    (@new_uid, @new_uname, '$2b$12$TEMP_MUST_CHANGE',
                     @name, @email,
                     @dept_id, 'VT06', 'member',
                     @new_expires, @member_id, @actor_id);

                UPDATE topic_members
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
        FROM users u
        JOIN topic_members tm ON tm.user_id = u.id
        JOIN @newly_granted ng ON ng.user_id = u.id
        WHERE tm.topic_id = @topic_id;

    END TRY
    BEGIN CATCH
        IF CURSOR_STATUS('local', 'mc') >= 0 BEGIN CLOSE mc; DEALLOCATE mc; END
        ROLLBACK TRANSACTION; THROW;
    END CATCH
END;
GO
