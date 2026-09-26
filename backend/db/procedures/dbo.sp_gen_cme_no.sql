-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
------------------------------------------------------------------------------
-- 5. sp_gen_cme_no — cấp số quyết định CME kế tiếp cho một năm
--    (mẫu sp_gen_*; @owner NVARCHAR(20) theo bài học 2026-08-28_fix_gen_id_applock_owner)
------------------------------------------------------------------------------
CREATE   PROCEDURE dbo.sp_gen_cme_no
    @year INT,
    @actor_id VARCHAR(20) = NULL,
    @new_seq INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    IF @year IS NULL OR @year < 2000 OR @year > 2100
        THROW 50051, N'Năm cấp CME không hợp lệ', 1;

    DECLARE @owner NVARCHAR(20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @lock_res NVARCHAR(64) = N'gen_cme_no_' + CAST(@year AS NVARCHAR(10));
    DECLARE @lock_ret INT;

    EXEC @lock_ret = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive',
         @LockOwner = @owner, @LockTimeout = 15000;
    IF @lock_ret < 0
        THROW 50052, N'Không lấy được khóa sinh số CME, vui lòng thử lại', 1;

    MERGE dbo.cme_year_register AS t
    USING (SELECT @year AS y) AS s ON t.[year] = s.y
    WHEN NOT MATCHED THEN INSERT ([year], last_seq, updated_by) VALUES (s.y, 0, @actor_id);

    UPDATE dbo.cme_year_register
       SET @new_seq = last_seq = last_seq + 1,
           updated_at = GETDATE(), updated_by = @actor_id
     WHERE [year] = @year;

    IF @owner = N'Session'
        EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = @owner;
END;
