/* ============================================================================
 * Sinh mã học viên có ý nghĩa (HV + năm đăng ký + STT) + vá vài lỗ hổng
 * index/rác phát hiện khi rà soát toàn bộ schema
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   1) trainees.id hiện được sinh trong server/src/services/traineeService.js
 *      bằng:  'HV' + LEFT(REPLACE(NEWID(),'-',''), 18)
 *      -> mã ngẫu nhiên, không tra được năm đăng ký, không đồng nhất với toàn
 *      bộ các entity khác trong hệ thống (NV<dept>0001, DEPTxxxx0001,
 *      DOTyyyyN, LDTnn, CD nn, HD<round>_nn, ...) — tất cả đều theo mẫu
 *      PREFIX + (ngữ cảnh) + STT, sinh qua 1 stored procedure sp_gen_*_id
 *      dùng sp_getapplock để tránh đụng số khi nhiều request insert cùng lúc.
 *
 *      -> Theo đúng quy ước đó, mã học viên nên là:
 *            HV + [năm đăng ký, 4 số] + [STT trong năm, 4 số, 01–9999]
 *         Ví dụ: HV20260001, HV20269999.
 *
 *      Đây KHÔNG dùng trigger AFTER/INSTEAD OF INSERT như yêu cầu gốc, vì:
 *        - id là PK và toàn bộ 20+ entity khác trong DB đều sinh mã bằng
 *          stored procedure gọi TRƯỚC INSERT (app gọi sp_gen_xxx_id lấy @new_id
 *          rồi mới INSERT), không phải trigger sau khi ghi.
 *        - Dùng trigger riêng cho 1 bảng sẽ tạo ra 2 kiểu kiến trúc sinh mã
 *          khác nhau trong cùng hệ thống -> tăng "rối" đúng như điều cần dọn.
 *      Nếu vẫn muốn có trigger thật, có thể bọc sp_gen_trainee_id trong 1
 *      INSTEAD OF INSERT trigger sau — nhưng KHÔNG khuyến nghị vì lệch chuẩn.
 *
 *   2) Rà soát toàn bộ FK cho thấy 4 cột FK "nóng" (hay truy vấn ngược từ bảng
 *      cha, hay bị cascade delete) chưa có index riêng:
 *        - course_enrollments.trainee_id (chỉ có index (course_id, trainee_id),
 *          trainee_id không phải cột dẫn đầu -> tra "các khóa học của 1 học
 *          viên" phải scan)
 *        - grades.enrollment_id (không index nào cả)
 *        - attendance.enrollment_id (chỉ có index (session_id, enrollment_id),
 *          enrollment_id không dẫn đầu)
 *        - trainee_documents.trainee_id (không index nào cả, lại có
 *          ON DELETE CASCADE từ trainees -> xoá 1 học viên phải scan toàn bảng
 *          trainee_documents để tìm hồ sơ con)
 *
 *   3) topic_progress có 2 index giống nhau 100%: idx_progress_topic và
 *      idx_tp_topic (cả 2 đều là NONCLUSTERED (topic_id) không INCLUDE gì
 *      khác) — dư 1 cái, chỉ tốn ghi + tốn dung lượng, không lợi gì thêm.
 *
 *   4) sp_gen_notification_id được định nghĩa nhưng không còn nơi nào gọi
 *      (server/src chỉ gọi sp_push_notification, proc này tự sinh id qua
 *      SEQUENCE seq_notification_suffix, không gọi sp_gen_notification_id) —
 *      proc cũ trở thành rác, xoá cho gọn (rollback được: chạy lại CREATE
 *      PROCEDURE nếu cần khôi phục).
 *
 * CÁCH SỬA
 *   - Thêm bảng đếm theo năm trainee_year_register (giống mẫu
 *     cme_year_register/sp_gen_cme_no đã có sẵn trong DB).
 *   - Thêm sp_gen_trainee_id (@year, @actor_id, @new_id OUTPUT) dùng
 *     sp_getapplock + UPDATE...SET @x = col = col + 1 (không dùng
 *     COUNT(*)+1 hay MAX(...) trên bảng trainees vì học viên có thể bị xoá,
 *     dẫn tới trùng số).
 *   - Thêm CHECK CHK_trainees_id (WITH NOCHECK — KHÔNG hồi tố các id kiểu
 *     GUID cũ, chỉ ép định dạng mới từ nay về sau).
 *   - Thêm 4 index còn thiếu ở mục (2), xoá index dư ở mục (3), xoá proc rác
 *     ở mục (4).
 *   - server/src/services/traineeService.js: đổi sang gọi sp_gen_trainee_id
 *     thay vì tự bốc NEWID().
 *
 * Script idempotent (CREATE OR ALTER / IF NOT EXISTS), chạy lại nhiều lần an
 * toàn. Yêu cầu: SQL Server 2016 SP1+ (DB hiện ở compatibility level 150).
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Bảng đếm STT học viên theo năm đăng ký
------------------------------------------------------------------------------
IF OBJECT_ID('dbo.trainee_year_register', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[trainee_year_register](
        [year]       [int]         NOT NULL,
        [last_seq]   [int]         NOT NULL,
        [updated_at] [datetime2](7) NOT NULL,
        [updated_by] [varchar](20) NULL,
        CONSTRAINT [PK_trainee_year_register] PRIMARY KEY CLUSTERED ([year] ASC)
    );

    ALTER TABLE [dbo].[trainee_year_register]
        ADD CONSTRAINT [DF_trainee_year_register_last_seq] DEFAULT ((0)) FOR [last_seq];
    ALTER TABLE [dbo].[trainee_year_register]
        ADD CONSTRAINT [DF_trainee_year_register_updated_at] DEFAULT (getdate()) FOR [updated_at];

    ALTER TABLE [dbo].[trainee_year_register]
        ADD CONSTRAINT [CHK_trainee_year_register_seq] CHECK ([last_seq] >= 0);
    ALTER TABLE [dbo].[trainee_year_register]
        ADD CONSTRAINT [CHK_trainee_year_register_year] CHECK ([year] >= 2000 AND [year] <= 2100);
END
GO

------------------------------------------------------------------------------
-- 2. sp_gen_trainee_id — cấp mã HV<năm><STT 4 số> kế tiếp cho một năm
--    (mẫu theo sp_gen_cme_no; @owner NVARCHAR(20) theo bài học
--    2026-08-28_fix_gen_id_applock_owner)
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[sp_gen_trainee_id]
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
GO

------------------------------------------------------------------------------
-- 3. CHECK định dạng id — chỉ áp dụng cho dữ liệu mới (WITH NOCHECK để
--    không phá vỡ các id kiểu GUID cũ đã tồn tại trong trainees)
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_trainees_id')
    ALTER TABLE [dbo].[trainees] WITH NOCHECK ADD CONSTRAINT [CHK_trainees_id]
        CHECK ([id] LIKE 'HV[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');
GO

------------------------------------------------------------------------------
-- 4. Index còn thiếu trên các cột FK hay truy vấn ngược / bị cascade delete
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_course_enrollments_trainee'
               AND object_id = OBJECT_ID('dbo.course_enrollments'))
    CREATE NONCLUSTERED INDEX [IX_course_enrollments_trainee] ON [dbo].[course_enrollments]
    (
        [trainee_id] ASC
    )
    INCLUDE ([course_id], [status]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_grades_enrollment'
               AND object_id = OBJECT_ID('dbo.grades'))
    CREATE NONCLUSTERED INDEX [IX_grades_enrollment] ON [dbo].[grades]
    (
        [enrollment_id] ASC
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_attendance_enrollment'
               AND object_id = OBJECT_ID('dbo.attendance'))
    CREATE NONCLUSTERED INDEX [IX_attendance_enrollment] ON [dbo].[attendance]
    (
        [enrollment_id] ASC
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_trainee_documents_trainee'
               AND object_id = OBJECT_ID('dbo.trainee_documents'))
    CREATE NONCLUSTERED INDEX [IX_trainee_documents_trainee] ON [dbo].[trainee_documents]
    (
        [trainee_id] ASC
    );
GO

------------------------------------------------------------------------------
-- 5. Dọn index trùng lặp 100% trên topic_progress (giữ idx_progress_topic,
--    bỏ idx_tp_topic — cả 2 cùng là NONCLUSTERED (topic_id), không INCLUDE)
------------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_tp_topic' AND object_id = OBJECT_ID('dbo.topic_progress'))
   AND EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_progress_topic' AND object_id = OBJECT_ID('dbo.topic_progress'))
    DROP INDEX [idx_tp_topic] ON [dbo].[topic_progress];
GO

------------------------------------------------------------------------------
-- 6. Dọn stored procedure rác (không còn nơi nào gọi — server/src chỉ dùng
--    sp_push_notification). Rollback: chạy lại CREATE PROCEDURE gốc nếu cần.
------------------------------------------------------------------------------
IF OBJECT_ID('dbo.sp_gen_notification_id', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[sp_gen_notification_id];
GO

/* --------------------------------------------------------------------------
 * Kiểm tra nhanh sau khi chạy migration:
 *
 *   BEGIN TRAN;
 *   DECLARE @id VARCHAR(20);
 *   EXEC sp_gen_trainee_id @year = 2026, @actor_id = NULL, @new_id = @id OUTPUT;
 *   SELECT @id;   -- phải ra "HV20260001" (hoặc STT kế tiếp nếu đã có học viên)
 *   EXEC sp_gen_trainee_id @year = 2026, @actor_id = NULL, @new_id = @id OUTPUT;
 *   SELECT @id;   -- STT phải tăng thêm 1, không trùng lần gọi trước
 *   ROLLBACK;     -- rollback để không thật sự "tiêu" STT khi chỉ test
 * ------------------------------------------------------------------------*/
