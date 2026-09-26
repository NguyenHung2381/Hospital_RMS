/* ============================================================================
 * Mã có ý nghĩa cho class_sessions / lecturer_assignments / grades
 * (thay 'BH'/'PC'/'KQ' + NEWID() ngẫu nhiên bằng PREFIX + ngày tạo + STT)
 * ----------------------------------------------------------------------------
 * VÌ SAO KHÔNG DÙNG TRIGGER (nhắc lại ngắn gọn, đã giải thích ở migration
 * trainee_id_generation)
 *   Muốn 1 trigger tự sinh PK rồi TRẢ NGƯỢC id đó về cho app là không khả thi
 *   an toàn trong SQL Server: OUTPUT INSERTED.id không dùng được khi bảng có
 *   INSTEAD OF INSERT trigger, trừ khi lách bằng cách để trigger tự SELECT id
 *   vừa tạo như 1 result set — cách này phụ thuộc server option "disallow
 *   results from triggers" (nhiều nơi BẬT cấu hình này vì lý do bảo mật/
 *   best practice, bật lên là mã vỡ ngay lập tức mà không có cảnh báo).
 *   => Dùng đúng pattern sp_gen_*_id đã có sẵn cho 20+ bảng khác (sinh mã
 *   TRƯỚC INSERT qua stored procedure, không qua trigger) để không tạo thêm
 *   1 kiến trúc sinh mã khác trong cùng DB.
 *
 * BỐI CẢNH
 *   - lecturer_assignments.id, class_sessions.id, grades.id đều varchar(20)
 *     và đang sinh bằng 'XX' + LEFT(REPLACE(NEWID(),'-',''), 18) — mã ngẫu
 *     nhiên, không tra được ngày tạo, không đồng nhất với phần còn lại của
 *     hệ thống.
 *   - Không thể nhúng course_id/enrollment_id vào mã như files/topic_members
 *     đã làm (id các bảng đó rộng hơn hẳn — varchar(22)/(32) — còn 3 bảng
 *     này chỉ varchar(20), course_id/enrollment_id tự nó đã có thể dài tới
 *     20 ký tự nên không nhét vừa). Do đó theo đúng mẫu đã dùng cho
 *     notifications/file_batches/files: PREFIX + ngày tạo (yyyyMMdd) + STT
 *     trong ngày (4 số) = 14 ký tự, vẫn nằm gọn trong varchar(20) và vẫn
 *     tra được "tạo ngày nào, thứ mấy trong ngày" thay vì hoàn toàn ngẫu
 *     nhiên như trước.
 *       BH20260921 0007  ->  BH202609210007  (buổi học)
 *       PC20260921 0003  ->  PC202609210003  (phân công giảng viên)
 *       KQ20260921 0012  ->  KQ202609210012  (kết quả/điểm)
 *   - Khác với sp_gen_notification_id/sp_gen_file_id cũ (COUNT(*)+1, có race
 *     condition đã biết), 3 proc mới dùng sp_getapplock + MAX(số cuối) như
 *     sp_gen_topic_id/sp_gen_user_id — không bị trùng số khi nhiều request
 *     ghi đồng thời, không bị lệch số khi có bản ghi bị xoá.
 *
 * CÁCH SỬA
 *   - Thêm sp_gen_class_session_id, sp_gen_lecturer_assignment_id,
 *     sp_gen_grade_id.
 *   - Thêm CHECK định dạng id cho 3 bảng (WITH NOCHECK — không hồi tố các id
 *     kiểu NEWID() cũ đã tồn tại, chỉ ép định dạng mới từ nay).
 *   - server/src/services/courseService.js: 4 chỗ gọi (assignLecturer,
 *     createSession, createSessionsBulk, upsertGrade) đổi sang gọi proc mới
 *     thay vì tự bốc NEWID().
 *
 * Script idempotent (CREATE OR ALTER / IF NOT EXISTS), chạy lại nhiều lần an
 * toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];


GO
------------------------------------------------------------------------------
-- 1. sp_gen_class_session_id — BH + yyyyMMdd + STT 4 số trong ngày
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[sp_gen_class_session_id]
@actor_id VARCHAR (20)=NULL, @new_id VARCHAR (20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ds AS VARCHAR (8) = CONVERT (VARCHAR (8), GETDATE(), 112);
    DECLARE @prefix AS VARCHAR (10) = 'BH' + @ds;
    DECLARE @owner AS NVARCHAR (20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @lock_res AS NVARCHAR (64) = N'gen_class_session_id_' + @prefix;
    DECLARE @rc AS INT;
    EXECUTE @rc = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive', @LockOwner = @owner, @LockTimeout = 5000;
    IF @rc < 0
        THROW 50070, N'Không lấy được khóa sinh mã buổi học, vui lòng thử lại', 1;
    DECLARE @next AS INT;
    SELECT @next = ISNULL(MAX(CAST (RIGHT(id, 4) AS INT)), 0) + 1
    FROM   dbo.class_sessions
    WHERE  id LIKE @prefix + '[0-9][0-9][0-9][0-9]';
    SET @new_id = @prefix + RIGHT('0000' + CAST (@next AS VARCHAR (4)), 4);
    IF @owner = N'Session'
        EXECUTE sp_releaseapplock @Resource = @lock_res, @LockOwner = @owner;
END


GO
------------------------------------------------------------------------------
-- 2. sp_gen_lecturer_assignment_id — PC + yyyyMMdd + STT 4 số trong ngày
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[sp_gen_lecturer_assignment_id]
@actor_id VARCHAR (20)=NULL, @new_id VARCHAR (20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ds AS VARCHAR (8) = CONVERT (VARCHAR (8), GETDATE(), 112);
    DECLARE @prefix AS VARCHAR (10) = 'PC' + @ds;
    DECLARE @owner AS NVARCHAR (20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @lock_res AS NVARCHAR (64) = N'gen_lecturer_assignment_id_' + @prefix;
    DECLARE @rc AS INT;
    EXECUTE @rc = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive', @LockOwner = @owner, @LockTimeout = 5000;
    IF @rc < 0
        THROW 50071, N'Không lấy được khóa sinh mã phân công giảng viên, vui lòng thử lại', 1;
    DECLARE @next AS INT;
    SELECT @next = ISNULL(MAX(CAST (RIGHT(id, 4) AS INT)), 0) + 1
    FROM   dbo.lecturer_assignments
    WHERE  id LIKE @prefix + '[0-9][0-9][0-9][0-9]';
    SET @new_id = @prefix + RIGHT('0000' + CAST (@next AS VARCHAR (4)), 4);
    IF @owner = N'Session'
        EXECUTE sp_releaseapplock @Resource = @lock_res, @LockOwner = @owner;
END


GO
------------------------------------------------------------------------------
-- 3. sp_gen_grade_id — KQ + yyyyMMdd + STT 4 số trong ngày
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[sp_gen_grade_id]
@actor_id VARCHAR (20)=NULL, @new_id VARCHAR (20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ds AS VARCHAR (8) = CONVERT (VARCHAR (8), GETDATE(), 112);
    DECLARE @prefix AS VARCHAR (10) = 'KQ' + @ds;
    DECLARE @owner AS NVARCHAR (20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @lock_res AS NVARCHAR (64) = N'gen_grade_id_' + @prefix;
    DECLARE @rc AS INT;
    EXECUTE @rc = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive', @LockOwner = @owner, @LockTimeout = 5000;
    IF @rc < 0
        THROW 50072, N'Không lấy được khóa sinh mã điểm, vui lòng thử lại', 1;
    DECLARE @next AS INT;
    SELECT @next = ISNULL(MAX(CAST (RIGHT(id, 4) AS INT)), 0) + 1
    FROM   dbo.grades
    WHERE  id LIKE @prefix + '[0-9][0-9][0-9][0-9]';
    SET @new_id = @prefix + RIGHT('0000' + CAST (@next AS VARCHAR (4)), 4);
    IF @owner = N'Session'
        EXECUTE sp_releaseapplock @Resource = @lock_res, @LockOwner = @owner;
END


GO
------------------------------------------------------------------------------
-- 4. CHECK định dạng id — chỉ áp dụng dữ liệu mới (WITH NOCHECK, không đụng
--    các id kiểu NEWID() cũ)
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1
               FROM   sys.check_constraints
               WHERE  name = 'CHK_class_sessions_id')
    ALTER TABLE [dbo].[class_sessions] WITH NOCHECK
        ADD CONSTRAINT [CHK_class_sessions_id] CHECK ([id] LIKE 'BH[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');


GO
IF NOT EXISTS (SELECT 1
               FROM   sys.check_constraints
               WHERE  name = 'CHK_lecturer_assignments_id')
    ALTER TABLE [dbo].[lecturer_assignments] WITH NOCHECK
        ADD CONSTRAINT [CHK_lecturer_assignments_id] CHECK ([id] LIKE 'PC[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');


GO
IF NOT EXISTS (SELECT 1
               FROM   sys.check_constraints
               WHERE  name = 'CHK_grades_id')
    ALTER TABLE [dbo].[grades] WITH NOCHECK
        ADD CONSTRAINT [CHK_grades_id] CHECK ([id] LIKE 'KQ[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');


/* --------------------------------------------------------------------------
 * Kiểm tra nhanh sau khi chạy migration:
 *
 *   BEGIN TRAN;
 *   DECLARE @id VARCHAR(20);
 *   EXEC sp_gen_class_session_id       @new_id = @id OUTPUT; SELECT @id;
 *   EXEC sp_gen_lecturer_assignment_id @new_id = @id OUTPUT; SELECT @id;
 *   EXEC sp_gen_grade_id               @new_id = @id OUTPUT; SELECT @id;
 *   ROLLBACK;   -- không "tiêu" STT thật khi chỉ test
 * ------------------------------------------------------------------------*/