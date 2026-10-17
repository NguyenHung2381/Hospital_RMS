-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
------------------------------------------------------------------------------
-- 7. sp_gen_certificate_no — tách từ inline code trong issueCertificate, có
--    applock (trước đây SELECT MAX(...)+1 trần, không khóa -> 2 request cấp
--    chứng chỉ cùng lúc có thể tranh nhau 1 số, 1 bên bị lỗi UNIQUE constraint
--    thay vì được cấp số kế tiếp đúng)
------------------------------------------------------------------------------
CREATE   PROCEDURE [dbo].[sp_gen_certificate_no]
    @year     INT          = NULL,   -- NULL = năm hiện tại
    @actor_id VARCHAR(20)  = NULL,
    @new_no   VARCHAR(30)  OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    IF @year IS NULL SET @year = YEAR(GETDATE());
    IF @year < 2000 OR @year > 2100
        THROW 50079, N'Năm cấp chứng chỉ không hợp lệ', 1;

    DECLARE @prefix VARCHAR(6) = 'CC' + CAST(@year AS VARCHAR(4));
    DECLARE @owner NVARCHAR(20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @lock_res NVARCHAR(64) = N'gen_certificate_no_' + @prefix;
    DECLARE @rc INT;
    EXEC @rc = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive',
                             @LockOwner = @owner, @LockTimeout = 5000;
    IF @rc < 0
        THROW 50080, N'Không lấy được khóa sinh số chứng chỉ, vui lòng thử lại', 1;

    DECLARE @next INT;
    SELECT @next = ISNULL(MAX(CAST(RIGHT(cert_no, 4) AS INT)), 0) + 1
    FROM dbo.certificates
    WHERE cert_no LIKE @prefix + '[0-9][0-9][0-9][0-9]';

    SET @new_no = @prefix + RIGHT('0000' + CAST(@next AS VARCHAR(4)), 4);

    IF @owner = N'Session'
        EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = @owner;
END;
