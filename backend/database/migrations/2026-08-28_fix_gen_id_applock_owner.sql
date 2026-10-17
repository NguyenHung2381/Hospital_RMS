/* ============================================================================
 * Sửa lỗi "Không lấy được khóa sinh mã nhân viên / đề tài, vui lòng thử lại"
 * ----------------------------------------------------------------------------
 * NGUYÊN NHÂN
 *   Trong sp_gen_user_id và sp_gen_topic_id:
 *       DECLARE @owner NVARCHAR(10) = CASE WHEN @@TRANCOUNT > 0
 *                                         THEN N'Transaction' ELSE N'Session' END;
 *   Chuỗi 'Transaction' dài 11 ký tự nhưng biến chỉ NVARCHAR(10) -> bị cắt
 *   âm thầm thành 'Transactio'. Khi proc được gọi BÊN TRONG transaction
 *   (@@TRANCOUNT > 0 — đúng như thiết kế: sinh mã rồi INSERT trong cùng
 *   transaction), sp_getapplock nhận @LockOwner = 'Transactio' (không hợp lệ)
 *   -> trả về giá trị âm -> RAISERROR. Lỗi xảy ra 100% ở nhánh này, không liên
 *   quan tới tranh chấp khóa.
 *
 * CÁCH SỬA
 *   Nới @owner thành NVARCHAR(20). Giữ nguyên toàn bộ logic còn lại.
 *
 * Script idempotent (CREATE OR ALTER), chạy lại nhiều lần an toàn.
 * Yêu cầu: SQL Server 2016 SP1+ (DB hiện ở compatibility level 150).
 * ==========================================================================*/

USE [RMS_HOSPITAL];
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_gen_user_id]
    @dept_code VARCHAR(20), @is_dept_account BIT = 0, @new_id VARCHAR(20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @prefix VARCHAR(12) = 'NV' + @dept_code;

    IF @is_dept_account = 1
    BEGIN
        SET @new_id = @prefix + '0000';
        IF EXISTS (SELECT 1 FROM users WHERE id = @new_id)
            RAISERROR(N'Tài khoản khoa %s đã tồn tại', 16, 1, @dept_code);
        RETURN;
    END

    DECLARE @lock_res NVARCHAR(64) = N'gen_user_id_' + @prefix;
    -- FIX: NVARCHAR(10) -> NVARCHAR(20) (chuỗi 'Transaction' dài 11 ký tự)
    DECLARE @owner NVARCHAR(20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @rc INT;
    EXEC @rc = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive',
                             @LockOwner = @owner, @LockTimeout = 5000;
    IF @rc < 0
    BEGIN
        RAISERROR(N'Không lấy được khóa sinh mã nhân viên, vui lòng thử lại', 16, 1);
        RETURN;
    END

    DECLARE @count INT;
    SELECT @count = ISNULL(MAX(CAST(RIGHT(id,4) AS INT)), 0) + 1
    FROM users
    WHERE id LIKE @prefix + '[0-9][0-9][0-9][0-9]' AND RIGHT(id,4) <> '0000';
    IF @count < 1 SET @count = 1;

    SET @new_id = @prefix + RIGHT('0000' + CAST(@count AS VARCHAR(4)), 4);

    IF @owner = N'Session'
        EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = N'Session';
END;
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_gen_topic_id]
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
GO

/* --------------------------------------------------------------------------
 * Kiểm tra nhanh sau khi chạy migration:
 *
 *   BEGIN TRAN;
 *   DECLARE @id VARCHAR(20);
 *   EXEC sp_gen_user_id @dept_code = 'KNA', @is_dept_account = 0, @new_id = @id OUTPUT;
 *   SELECT @id;               -- phải ra mã dạng NVKNA0001, KHÔNG còn RAISERROR
 *   ROLLBACK;
 * ------------------------------------------------------------------------*/
