-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
------------------------------------------------------------------------------
-- 4. sp_gen_attendance_id — DD + yyyyMMdd + STT 4 số trong ngày
------------------------------------------------------------------------------
CREATE   PROCEDURE [dbo].[sp_gen_attendance_id]
    @actor_id VARCHAR(20) = NULL,
    @new_id   VARCHAR(20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ds     VARCHAR(8)  = CONVERT(VARCHAR(8), GETDATE(), 112);
    DECLARE @prefix VARCHAR(10) = 'DD' + @ds;

    DECLARE @owner NVARCHAR(20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @lock_res NVARCHAR(64) = N'gen_attendance_id_' + @prefix;
    DECLARE @rc INT;
    EXEC @rc = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive',
                             @LockOwner = @owner, @LockTimeout = 5000;
    IF @rc < 0
        THROW 50076, N'Không lấy được khóa sinh mã điểm danh, vui lòng thử lại', 1;

    DECLARE @next INT;
    SELECT @next = ISNULL(MAX(CAST(RIGHT(id, 4) AS INT)), 0) + 1
    FROM dbo.attendance
    WHERE id LIKE @prefix + '[0-9][0-9][0-9][0-9]';

    SET @new_id = @prefix + RIGHT('0000' + CAST(@next AS VARCHAR(4)), 4);

    IF @owner = N'Session'
        EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = @owner;
END;
