/* ============================================================================
 * Mã có ý nghĩa cho 6 chỗ NEWID() còn lại trong courseService.js
 * (courses, course_programs, course_enrollments, attendance,
 *  course_documents, certificates) + vá 1 race condition phát hiện thêm khi
 *  soát certificates.cert_no
 * ----------------------------------------------------------------------------
 * Không dùng trigger — cùng lý do đã nêu ở 2 migration trước
 * (2026-09-21_trainee_id_generation, 2026-09-23_meaningful_ids_...):
 * OUTPUT INSERTED.id không dùng được với bảng có INSTEAD OF INSERT trigger,
 * cách lách phụ thuộc server option "disallow results from triggers" hay bị
 * bật vì lý do bảo mật. Tiếp tục dùng đúng pattern sp_gen_*_id sinh mã TRƯỚC
 * INSERT, gọi bằng stored procedure.
 *
 * BỐI CẢNH
 *   6 bảng dưới đều varchar(20) cho cột id, đang sinh bằng
 *   'XX' + LEFT(REPLACE(NEWID(),'-',''), 18). Đổi sang PREFIX + yyyyMMdd +
 *   STT 4 số trong ngày (14 ký tự), giống 2026-09-23:
 *       courses            KH202609210007
 *       course_programs    CP202609210003
 *       course_enrollments DK202609210012
 *       attendance         DD202609210045
 *       course_documents   TL202609210002
 *       certificates       CH202609210001   (chỉ đổi PK nội bộ id)
 *
 *   PHÁT HIỆN THÊM khi soát certificates: cert_no (mã chứng chỉ HIỂN THỊ cho
 *   học viên, khác với cột id nội bộ) đã được sinh có ý nghĩa từ trước
 *   (CC + năm + STT 4 số, ví dụ CC20260007) — đúng tinh thần bạn muốn, không
 *   cần đổi định dạng. NHƯNG đoạn sinh @seq nằm thẳng trong
 *   courseService.issueCertificate, dùng SELECT MAX(...)+1 KHÔNG có
 *   sp_getapplock bảo vệ — đúng lỗi race condition đã từng vá cho
 *   sp_gen_user_id/sp_gen_topic_id/sp_gen_cme_no (2026-08-28). Có UQ_cert_no
 *   (UNIQUE) nên 2 request trùng giờ sẽ không tạo dữ liệu sai, nhưng 1 trong
 *   2 sẽ nhận lỗi UNIQUE constraint thô thay vì được cấp số kế tiếp đúng. Đưa
 *   logic ra sp_gen_certificate_no + applock để tránh lỗi cấp chứng chỉ khi
 *   2 người bấm "cấp chứng chỉ" cùng lúc.
 *
 * CÁCH SỬA
 *   - Thêm 6 proc sp_gen_course_id, sp_gen_course_program_id,
 *     sp_gen_course_enrollment_id, sp_gen_attendance_id,
 *     sp_gen_course_document_id, sp_gen_certificate_id — cùng mẫu
 *     sp_getapplock + MAX(số cuối) như 2026-09-23.
 *   - Thêm sp_gen_certificate_no (tách từ inline code, có applock).
 *   - Thêm CHECK định dạng id cho 6 bảng (WITH NOCHECK).
 *   - server/src/services/courseService.js: 6 chỗ tạo id + đoạn sinh cert_no
 *     đổi sang gọi proc mới.
 *
 * Script idempotent (CREATE OR ALTER / IF NOT EXISTS), chạy lại nhiều lần an
 * toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. sp_gen_course_id — KH + yyyyMMdd + STT 4 số trong ngày
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[sp_gen_course_id]
    @actor_id VARCHAR(20) = NULL,
    @new_id   VARCHAR(20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ds     VARCHAR(8)  = CONVERT(VARCHAR(8), GETDATE(), 112);
    DECLARE @prefix VARCHAR(10) = 'KH' + @ds;

    DECLARE @owner NVARCHAR(20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @lock_res NVARCHAR(64) = N'gen_course_id_' + @prefix;
    DECLARE @rc INT;
    EXEC @rc = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive',
                             @LockOwner = @owner, @LockTimeout = 5000;
    IF @rc < 0
        THROW 50073, N'Không lấy được khóa sinh mã khóa học, vui lòng thử lại', 1;

    DECLARE @next INT;
    SELECT @next = ISNULL(MAX(CAST(RIGHT(id, 4) AS INT)), 0) + 1
    FROM dbo.courses
    WHERE id LIKE @prefix + '[0-9][0-9][0-9][0-9]';

    SET @new_id = @prefix + RIGHT('0000' + CAST(@next AS VARCHAR(4)), 4);

    IF @owner = N'Session'
        EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = @owner;
END;
GO

------------------------------------------------------------------------------
-- 2. sp_gen_course_program_id — CP + yyyyMMdd + STT 4 số trong ngày
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[sp_gen_course_program_id]
    @actor_id VARCHAR(20) = NULL,
    @new_id   VARCHAR(20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ds     VARCHAR(8)  = CONVERT(VARCHAR(8), GETDATE(), 112);
    DECLARE @prefix VARCHAR(10) = 'CP' + @ds;

    DECLARE @owner NVARCHAR(20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @lock_res NVARCHAR(64) = N'gen_course_program_id_' + @prefix;
    DECLARE @rc INT;
    EXEC @rc = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive',
                             @LockOwner = @owner, @LockTimeout = 5000;
    IF @rc < 0
        THROW 50074, N'Không lấy được khóa sinh mã chương trình áp dụng, vui lòng thử lại', 1;

    DECLARE @next INT;
    SELECT @next = ISNULL(MAX(CAST(RIGHT(id, 4) AS INT)), 0) + 1
    FROM dbo.course_programs
    WHERE id LIKE @prefix + '[0-9][0-9][0-9][0-9]';

    SET @new_id = @prefix + RIGHT('0000' + CAST(@next AS VARCHAR(4)), 4);

    IF @owner = N'Session'
        EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = @owner;
END;
GO

------------------------------------------------------------------------------
-- 3. sp_gen_course_enrollment_id — DK + yyyyMMdd + STT 4 số trong ngày
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[sp_gen_course_enrollment_id]
    @actor_id VARCHAR(20) = NULL,
    @new_id   VARCHAR(20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ds     VARCHAR(8)  = CONVERT(VARCHAR(8), GETDATE(), 112);
    DECLARE @prefix VARCHAR(10) = 'DK' + @ds;

    DECLARE @owner NVARCHAR(20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @lock_res NVARCHAR(64) = N'gen_course_enrollment_id_' + @prefix;
    DECLARE @rc INT;
    EXEC @rc = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive',
                             @LockOwner = @owner, @LockTimeout = 5000;
    IF @rc < 0
        THROW 50075, N'Không lấy được khóa sinh mã đăng ký khóa học, vui lòng thử lại', 1;

    DECLARE @next INT;
    SELECT @next = ISNULL(MAX(CAST(RIGHT(id, 4) AS INT)), 0) + 1
    FROM dbo.course_enrollments
    WHERE id LIKE @prefix + '[0-9][0-9][0-9][0-9]';

    SET @new_id = @prefix + RIGHT('0000' + CAST(@next AS VARCHAR(4)), 4);

    IF @owner = N'Session'
        EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = @owner;
END;
GO

------------------------------------------------------------------------------
-- 4. sp_gen_attendance_id — DD + yyyyMMdd + STT 4 số trong ngày
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[sp_gen_attendance_id]
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
GO

------------------------------------------------------------------------------
-- 5. sp_gen_course_document_id — TL + yyyyMMdd + STT 4 số trong ngày
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[sp_gen_course_document_id]
    @actor_id VARCHAR(20) = NULL,
    @new_id   VARCHAR(20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ds     VARCHAR(8)  = CONVERT(VARCHAR(8), GETDATE(), 112);
    DECLARE @prefix VARCHAR(10) = 'TL' + @ds;

    DECLARE @owner NVARCHAR(20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @lock_res NVARCHAR(64) = N'gen_course_document_id_' + @prefix;
    DECLARE @rc INT;
    EXEC @rc = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive',
                             @LockOwner = @owner, @LockTimeout = 5000;
    IF @rc < 0
        THROW 50077, N'Không lấy được khóa sinh mã tài liệu khóa học, vui lòng thử lại', 1;

    DECLARE @next INT;
    SELECT @next = ISNULL(MAX(CAST(RIGHT(id, 4) AS INT)), 0) + 1
    FROM dbo.course_documents
    WHERE id LIKE @prefix + '[0-9][0-9][0-9][0-9]';

    SET @new_id = @prefix + RIGHT('0000' + CAST(@next AS VARCHAR(4)), 4);

    IF @owner = N'Session'
        EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = @owner;
END;
GO

------------------------------------------------------------------------------
-- 6. sp_gen_certificate_id — CH + yyyyMMdd + STT 4 số trong ngày (PK nội bộ,
--    khác cert_no là mã hiển thị cho học viên — xem mục 7)
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[sp_gen_certificate_id]
    @actor_id VARCHAR(20) = NULL,
    @new_id   VARCHAR(20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ds     VARCHAR(8)  = CONVERT(VARCHAR(8), GETDATE(), 112);
    DECLARE @prefix VARCHAR(10) = 'CH' + @ds;

    DECLARE @owner NVARCHAR(20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @lock_res NVARCHAR(64) = N'gen_certificate_id_' + @prefix;
    DECLARE @rc INT;
    EXEC @rc = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive',
                             @LockOwner = @owner, @LockTimeout = 5000;
    IF @rc < 0
        THROW 50078, N'Không lấy được khóa sinh mã chứng chỉ, vui lòng thử lại', 1;

    DECLARE @next INT;
    SELECT @next = ISNULL(MAX(CAST(RIGHT(id, 4) AS INT)), 0) + 1
    FROM dbo.certificates
    WHERE id LIKE @prefix + '[0-9][0-9][0-9][0-9]';

    SET @new_id = @prefix + RIGHT('0000' + CAST(@next AS VARCHAR(4)), 4);

    IF @owner = N'Session'
        EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = @owner;
END;
GO

------------------------------------------------------------------------------
-- 7. sp_gen_certificate_no — tách từ inline code trong issueCertificate, có
--    applock (trước đây SELECT MAX(...)+1 trần, không khóa -> 2 request cấp
--    chứng chỉ cùng lúc có thể tranh nhau 1 số, 1 bên bị lỗi UNIQUE constraint
--    thay vì được cấp số kế tiếp đúng)
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[sp_gen_certificate_no]
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
GO

------------------------------------------------------------------------------
-- 8. CHECK định dạng id — chỉ áp dụng dữ liệu mới (WITH NOCHECK, không đụng
--    các id kiểu NEWID() cũ)
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_courses_id')
    ALTER TABLE [dbo].[courses] WITH NOCHECK ADD CONSTRAINT [CHK_courses_id]
        CHECK ([id] LIKE 'KH[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_course_programs_id')
    ALTER TABLE [dbo].[course_programs] WITH NOCHECK ADD CONSTRAINT [CHK_course_programs_id]
        CHECK ([id] LIKE 'CP[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_course_enrollments_id')
    ALTER TABLE [dbo].[course_enrollments] WITH NOCHECK ADD CONSTRAINT [CHK_course_enrollments_id]
        CHECK ([id] LIKE 'DK[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_attendance_id')
    ALTER TABLE [dbo].[attendance] WITH NOCHECK ADD CONSTRAINT [CHK_attendance_id]
        CHECK ([id] LIKE 'DD[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_course_documents_id')
    ALTER TABLE [dbo].[course_documents] WITH NOCHECK ADD CONSTRAINT [CHK_course_documents_id]
        CHECK ([id] LIKE 'TL[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_certificates_id')
    ALTER TABLE [dbo].[certificates] WITH NOCHECK ADD CONSTRAINT [CHK_certificates_id]
        CHECK ([id] LIKE 'CH[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');
GO

/* --------------------------------------------------------------------------
 * Kiểm tra nhanh sau khi chạy migration:
 *
 *   BEGIN TRAN;
 *   DECLARE @id VARCHAR(20), @no VARCHAR(30);
 *   EXEC sp_gen_course_id             @new_id = @id OUTPUT; SELECT @id;
 *   EXEC sp_gen_course_program_id     @new_id = @id OUTPUT; SELECT @id;
 *   EXEC sp_gen_course_enrollment_id  @new_id = @id OUTPUT; SELECT @id;
 *   EXEC sp_gen_attendance_id         @new_id = @id OUTPUT; SELECT @id;
 *   EXEC sp_gen_course_document_id    @new_id = @id OUTPUT; SELECT @id;
 *   EXEC sp_gen_certificate_id        @new_id = @id OUTPUT; SELECT @id;
 *   EXEC sp_gen_certificate_no @year = 2026, @new_no = @no OUTPUT; SELECT @no;
 *   ROLLBACK;   -- không "tiêu" STT thật khi chỉ test
 * ------------------------------------------------------------------------*/
