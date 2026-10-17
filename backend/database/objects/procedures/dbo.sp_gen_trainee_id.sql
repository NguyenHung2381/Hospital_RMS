-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
------------------------------------------------------------------------------
-- 2. sp_gen_trainee_id — cấp mã HV<năm><STT 4 số> kế tiếp cho một năm
--    (mẫu theo sp_gen_cme_no; @owner NVARCHAR(20) theo bài học
--    2026-08-28_fix_gen_id_applock_owner)
------------------------------------------------------------------------------
CREATE   PROCEDURE [dbo].[sp_gen_trainee_id]
    @year     INT          = NULL,   -- NULL = lấy năm hiện tại (năm đăng ký)
    @actor_id VARCHAR(20)  = NULL,
    @new_id   VARCHAR(20)  OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    IF @year IS NULL SET @year = YEAR(GETDATE());
    IF @year < 2000 OR @year > 2100
        THROW 50060, N'Năm đăng ký học viên không hợp lệ', 1;

    DECLARE @owner NVARCHAR(20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @lock_res NVARCHAR(64) = N'gen_trainee_id_' + CAST(@year AS NVARCHAR(10));
    DECLARE @lock_ret INT;

    EXEC @lock_ret = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive',
         @LockOwner = @owner, @LockTimeout = 15000;
    IF @lock_ret < 0
        THROW 50061, N'Không lấy được khóa sinh mã học viên, vui lòng thử lại', 1;

    MERGE dbo.trainee_year_register AS t
    USING (SELECT @year AS y) AS s ON t.[year] = s.y
    WHEN NOT MATCHED THEN INSERT ([year], last_seq, updated_by) VALUES (s.y, 0, @actor_id);

    DECLARE @next_seq INT;
    UPDATE dbo.trainee_year_register
       SET @next_seq = last_seq = last_seq + 1,
           updated_at = GETDATE(), updated_by = @actor_id
     WHERE [year] = @year;

    IF @next_seq > 9999
    BEGIN
        IF @owner = N'Session'
            EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = @owner;
        THROW 50062, N'Đã vượt quá 9999 học viên đăng ký trong năm nay, không thể sinh thêm mã', 1;
    END

    SET @new_id = 'HV' + CAST(@year AS VARCHAR(4)) + RIGHT('0000' + CAST(@next_seq AS VARCHAR(4)), 4);

    IF @owner = N'Session'
        EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = @owner;
    -- Nếu owner = Transaction: khóa tự nhả khi COMMIT/ROLLBACK,
    -- đảm bảo không ai chen vào giữa lúc sinh ID và lúc INSERT.
END;
