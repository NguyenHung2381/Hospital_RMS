-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
-- 4c. sp_resolve_recipients: loại tài khoản khoa dùng chung = role_id 'VT07'
CREATE   PROCEDURE [dbo].[sp_resolve_recipients]
    @user_ids               NVARCHAR(MAX) = NULL,
    @role_ids               NVARCHAR(MAX) = NULL,
    @department_ids          NVARCHAR(MAX) = NULL,
    @include_dept_accounts   BIT           = 0,
    @topic_id               VARCHAR(15)   = NULL,
    @topic_member_roles     NVARCHAR(MAX) = NULL,
    @all_active             BIT           = 0,
    @resolved_ids           NVARCHAR(MAX) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ids TABLE (user_id VARCHAR(20) PRIMARY KEY);

    IF @user_ids IS NOT NULL AND @user_ids <> '[]'
        INSERT INTO @ids (user_id)
        SELECT DISTINCT [value]
        FROM OPENJSON(@user_ids)
        WHERE [value] NOT IN (SELECT user_id FROM @ids);

    IF @role_ids IS NOT NULL AND @role_ids <> '[]'
        INSERT INTO @ids (user_id)
        SELECT DISTINCT u.id
        FROM users u
        WHERE u.is_active = 1
            AND u.role_id IN (SELECT [value] FROM OPENJSON(@role_ids))
            AND u.id NOT IN (SELECT user_id FROM @ids);

    -- department_ids (+ include_dept_accounts): mặc định loại tài khoản khoa
    -- dùng chung (vai trò VT07), trừ khi bật cờ.
    IF @department_ids IS NOT NULL AND @department_ids <> '[]'
        INSERT INTO @ids (user_id)
        SELECT DISTINCT u.id
        FROM users u
        WHERE u.is_active = 1
            AND u.department_id IN (SELECT [value] FROM OPENJSON(@department_ids))
            AND (@include_dept_accounts = 1 OR u.role_id <> 'VT07')
            AND u.id NOT IN (SELECT user_id FROM @ids);

    IF @topic_id IS NOT NULL
    BEGIN
        INSERT INTO @ids (user_id)
        SELECT DISTINCT t.created_by
        FROM topics t
        WHERE t.id = @topic_id
            AND t.created_by IS NOT NULL
            AND (@topic_member_roles IS NULL OR @topic_member_roles = '[]')
            AND t.created_by NOT IN (SELECT user_id FROM @ids);

        INSERT INTO @ids (user_id)
        SELECT DISTINCT tm.user_id
        FROM topic_members tm
        WHERE tm.topic_id = @topic_id
            AND tm.user_id IS NOT NULL
            AND tm.account_granted = 1
            AND (
                @topic_member_roles IS NULL OR @topic_member_roles = '[]'
                OR tm.role IN (SELECT [value] FROM OPENJSON(@topic_member_roles))
            )
            AND tm.user_id NOT IN (SELECT user_id FROM @ids);
    END

    IF @all_active = 1
        INSERT INTO @ids (user_id)
        SELECT DISTINCT u.id
        FROM users u
        WHERE u.is_active = 1
            AND u.id NOT IN (SELECT user_id FROM @ids);

    SELECT @resolved_ids = '[' + STRING_AGG('"' + user_id + '"', ',') + ']'
    FROM @ids;

    SET @resolved_ids = ISNULL(@resolved_ids, '[]');
END;
