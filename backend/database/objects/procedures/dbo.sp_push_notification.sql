-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
-- DÃ²ng cÅ© (trÆ°á»›c migration) cÃ³ batch_id = NULL â€” váº«n hiá»ƒn thá»‹ Ä‘Ãºng lÃ  1 lÆ°á»£t
-- gá»­i Ä‘á»™c láº­p á»Ÿ phÃ­a admin nhá» COALESCE(batch_id, id), khÃ´ng cáº§n backfill.

CREATE PROCEDURE [dbo].[sp_push_notification]
    -- Ná»™i dung thÃ´ng bÃ¡o
    @type     VARCHAR(50),
    @title    NVARCHAR(255),
    @message  NVARCHAR(MAX) = NULL,
    @ref_id   VARCHAR(30)   = NULL,
    @ref_type VARCHAR(20)   = NULL,

    -- === NgÆ°á»i nháº­n: truyá»n Ã­t nháº¥t 1 trong cÃ¡c tham sá»‘ sau ===

    -- CÃ¡ch 1 (cÅ©, váº«n giá»¯): JSON array user_id trá»±c tiáº¿p
    @user_ids            NVARCHAR(MAX) = NULL,   -- ["uid1","uid2"]

    -- CÃ¡ch 2 (má»›i): Targeting theo nhÃ³m
    @role_ids            NVARCHAR(MAX) = NULL,   -- ["VT03","VT07"]
    @department_ids      NVARCHAR(MAX) = NULL,   -- ["DV002","DV005"]
    @include_dept_accounts BIT          = 0,
    @topic_id            VARCHAR(15)   = NULL,
    @topic_member_roles  NVARCHAR(MAX) = NULL,
    @all_active          BIT           = 0
AS
BEGIN
    SET NOCOUNT ON;

    -- Kiá»ƒm tra cÃ³ Ã­t nháº¥t 1 nguá»“n ngÆ°á»i nháº­n
    IF  (@user_ids       IS NULL OR @user_ids       = '[]')
    AND (@role_ids       IS NULL OR @role_ids       = '[]')
    AND (@department_ids IS NULL OR @department_ids = '[]')
    AND  @topic_id       IS NULL
    AND  @all_active     = 0
    BEGIN
        RAISERROR(N'sp_push_notification: Pháº£i truyá»n Ã­t nháº¥t 1 tham sá»‘ ngÆ°á»i nháº­n.', 16, 1);
        RETURN;
    END

    -- Giáº£i quyáº¿t danh sÃ¡ch ngÆ°á»i nháº­n cuá»‘i cÃ¹ng
    DECLARE @final_ids NVARCHAR(MAX);

    EXEC [dbo].[sp_resolve_recipients]
        @user_ids             = @user_ids,
        @role_ids             = @role_ids,
        @department_ids       = @department_ids,
        @include_dept_accounts= @include_dept_accounts,
        @topic_id             = @topic_id,
        @topic_member_roles   = @topic_member_roles,
        @all_active           = @all_active,
        @resolved_ids         = @final_ids OUTPUT;

    IF @final_ids IS NULL OR @final_ids = '[]'
    BEGIN
        PRINT N'sp_push_notification: KhÃ´ng cÃ³ ngÆ°á»i nháº­n há»£p lá»‡, bá» qua.';
        RETURN;
    END

    -- Má»™t batch_id duy nháº¥t cho cáº£ lÆ°á»£t gá»­i nÃ y, Ä‘á»ƒ phÃ­a admin gá»™p láº¡i
    -- thÃ nh 1 hÃ ng thay vÃ¬ N hÃ ng (N = sá»‘ ngÆ°á»i nháº­n).
    DECLARE @batch_id VARCHAR(30) =
        'NTFB' + FORMAT(GETDATE(), 'yyyyMMddHHmmss')
              + RIGHT('00000' + CAST(NEXT VALUE FOR dbo.seq_notification_suffix AS VARCHAR(5)), 5);

    -- Insert batch, prefix NTF + yyyyMMddHHmmss + 5 chá»¯ sá»‘ thá»© tá»± (tá»« SEQUENCE, khÃ´ng bá»‹ trÃ¹ng giá»¯a cÃ¡c láº§n gá»i)
    INSERT INTO [dbo].[notifications]
        ([id], [user_id], [type], [title], [message], [ref_id], [ref_type], [batch_id])
    SELECT
        'NTF' + FORMAT(GETDATE(), 'yyyyMMddHHmmss')
              + RIGHT('00000' + CAST(NEXT VALUE FOR dbo.seq_notification_suffix OVER (ORDER BY u.[id]) AS VARCHAR(5)), 5),
        u.[id],
        @type,
        @title,
        @message,
        @ref_id,
        @ref_type,
        @batch_id
    FROM OPENJSON(@final_ids) oj
    JOIN [dbo].[users] u ON u.[id] = oj.[value]
    WHERE u.[is_active] = 1;
END;
