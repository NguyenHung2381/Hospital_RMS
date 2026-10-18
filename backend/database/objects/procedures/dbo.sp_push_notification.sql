-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
/* ============================================================================
 * 2026-11-03_fix_sp_push_notification_encoding
 * ----------------------------------------------------------------------------
 *   Tạo lại sp_push_notification với chữ tiếng Việt đúng UTF-8. Bản đang có
 *   trong DB bị lỗi mã hoá (UTF-8 bị đọc thành cp1252 lúc tạo — sqlcmd thiếu
 *   -f 65001): comment và 2 thông báo RAISERROR/PRINT hiện thành chữ vỡ.
 *   Logic KHÔNG đổi — phần code ngoài comment/chuỗi giống hệt bản cũ.
 * Idempotent (CREATE OR ALTER) — chạy lại an toàn.
 * ==========================================================================*/

-- Dòng cũ (trước migration) có batch_id = NULL — vẫn hiển thị đúng là 1 lượt
-- gửi độc lập ở phía admin nhờ COALESCE(batch_id, id), không cần backfill.

CREATE   PROCEDURE [dbo].[sp_push_notification]
    -- Nội dung thông báo
    @type     VARCHAR(50),
    @title    NVARCHAR(255),
    @message  NVARCHAR(MAX) = NULL,
    @ref_id   VARCHAR(30)   = NULL,
    @ref_type VARCHAR(20)   = NULL,

    -- === Người nhận: truyền ít nhất 1 trong các tham số sau ===

    -- Cách 1 (cũ, vẫn giữ): JSON array user_id trực tiếp
    @user_ids            NVARCHAR(MAX) = NULL,   -- ["uid1","uid2"]

    -- Cách 2 (mới): Targeting theo nhóm
    @role_ids            NVARCHAR(MAX) = NULL,   -- ["VT03","VT07"]
    @department_ids      NVARCHAR(MAX) = NULL,   -- ["DV002","DV005"]
    @include_dept_accounts BIT          = 0,
    @topic_id            VARCHAR(15)   = NULL,
    @topic_member_roles  NVARCHAR(MAX) = NULL,
    @all_active          BIT           = 0
AS
BEGIN
    SET NOCOUNT ON;

    -- Kiểm tra có ít nhất 1 nguồn người nhận
    IF  (@user_ids       IS NULL OR @user_ids       = '[]')
    AND (@role_ids       IS NULL OR @role_ids       = '[]')
    AND (@department_ids IS NULL OR @department_ids = '[]')
    AND  @topic_id       IS NULL
    AND  @all_active     = 0
    BEGIN
        RAISERROR(N'sp_push_notification: Phải truyền ít nhất 1 tham số người nhận.', 16, 1);
        RETURN;
    END

    -- Giải quyết danh sách người nhận cuối cùng
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
        PRINT N'sp_push_notification: Không có người nhận hợp lệ, bỏ qua.';
        RETURN;
    END

    -- Một batch_id duy nhất cho cả lượt gửi này, để phía admin gộp lại
    -- thành 1 hàng thay vì N hàng (N = số người nhận).
    DECLARE @batch_id VARCHAR(30) =
        'NTFB' + FORMAT(GETDATE(), 'yyyyMMddHHmmss')
              + RIGHT('00000' + CAST(NEXT VALUE FOR dbo.seq_notification_suffix AS VARCHAR(5)), 5);

    -- Insert batch, prefix NTF + yyyyMMddHHmmss + 5 chữ số thứ tự (từ SEQUENCE, không bị trùng giữa các lần gọi)
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
