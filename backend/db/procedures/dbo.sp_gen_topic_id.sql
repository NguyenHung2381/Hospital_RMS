-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
CREATE   PROCEDURE [dbo].[sp_gen_topic_id]
    @category_id VARCHAR(6),
    @round_id    VARCHAR(10),
    @new_id      VARCHAR(15) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @abbr VARCHAR(10);
    SELECT @abbr = abbr FROM dbo.categories WHERE id = @category_id;
    IF @abbr IS NULL
    BEGIN
        RAISERROR(N'Loại đề tài %s không hợp lệ hoặc chưa có ký hiệu viết tắt', 16, 1, @category_id);
        RETURN;
    END

    DECLARE @year INT;
    SELECT @year = year FROM dbo.research_rounds WHERE id = @round_id;
    IF @year IS NULL
    BEGIN
        RAISERROR(N'Đợt nghiên cứu %s không tồn tại', 16, 1, @round_id);
        RETURN;
    END

    DECLARE @prefix VARCHAR(11) = @abbr + '_' + CAST(@year AS VARCHAR(4)) + '_';

    -- Khóa theo prefix: các category/năm khác nhau không chặn nhau
    DECLARE @lock_res NVARCHAR(64) = N'gen_topic_id_' + @prefix;
    -- FIX: NVARCHAR(10) -> NVARCHAR(20) (chuỗi 'Transaction' dài 11 ký tự)
    DECLARE @owner NVARCHAR(20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @rc INT;
    EXEC @rc = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive',
                             @LockOwner = @owner, @LockTimeout = 5000;
    IF @rc < 0
    BEGIN
        RAISERROR(N'Không lấy được khóa sinh mã đề tài, vui lòng thử lại', 16, 1);
        RETURN;
    END

    -- MAX trên số cuối thay vì COUNT(*): không bị lệch khi có đề tài bị xóa
    DECLARE @next INT;
    SELECT @next = ISNULL(MAX(CAST(RIGHT(id, 3) AS INT)), 0) + 1
    FROM dbo.topics
    WHERE id LIKE @prefix + '[0-9][0-9][0-9]';

    SET @new_id = @prefix + RIGHT('000' + CAST(@next AS VARCHAR(3)), 3);

    IF @owner = N'Session'
        EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = N'Session';
    -- Nếu owner = Transaction: khóa tự nhả khi COMMIT/ROLLBACK,
    -- đảm bảo không ai chen vào giữa lúc sinh ID và lúc INSERT.
END;
