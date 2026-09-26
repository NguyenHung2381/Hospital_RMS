/* ============================================================================
 * Rà thêm courses / class_sessions / lecturer_assignments (theo yêu cầu) +
 * vá luôn phần status thiếu CHECK ở cùng module Đào tạo
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   1) class_sessions.session_date KHÔNG có index riêng. Dashboard đào tạo
 *      (server/src/services/dashboardService.js, mục "Lịch học 7 ngày tới")
 *      chạy:
 *          WHERE sess.session_date >= ... AND sess.session_date <= ...
 *      không lọc theo course_id, nên index sẵn có IX_class_sessions_course
 *      (course_id, session_date) KHÔNG dùng được (course_id không nằm trong
 *      điều kiện lọc) -> mỗi lần load dashboard đều scan toàn bảng
 *      class_sessions. Đây là truy vấn chạy trên trang chủ, nên đáng ưu tiên.
 *
 *   2) lecturer_assignments.lecturer_id không có index, nhưng
 *      server/src/services/lecturerService.js (hàm remove — xoá giảng viên)
 *      chạy thẳng:
 *          SELECT TOP 1 1 FROM lecturer_assignments WHERE lecturer_id = @id
 *      để quyết định xoá cứng hay chỉ vô hiệu hoá -> mỗi lần xoá 1 giảng viên
 *      đều scan toàn bảng lecturer_assignments.
 *
 *   3) lecturer_assignments.course_id có FK ON DELETE CASCADE từ courses
 *      nhưng không có index -> xoá 1 khóa học phải scan toàn bảng
 *      lecturer_assignments để tìm bản ghi con cần cascade xoá theo.
 *
 *   4) courses.status là varchar(15) tự do, không có CHECK enum — khác với
 *      hầu hết bảng "status" khác trong DB (topics, councils, approvals,
 *      research_rounds đều có CHECK). Đối chiếu
 *      client/src/features/course/types/course.type.ts thì giá trị hợp lệ
 *      chỉ có: draft | open | closed | completed | cancelled. Rà thêm thấy
 *      cùng lỗ hổng này lặp lại ở toàn bộ module Đào tạo (không phải chỉ 3
 *      bảng được yêu cầu), nên vá luôn cho nhất quán:
 *        - course_enrollments.status  : pending | approved | rejected | waitlisted
 *        - course_programs.status     : active | inactive
 *        - attendance.status          : present | absent | late
 *        - certificates.status        : active | revoked
 *      (class_sessions và lecturer_assignments không có cột status nên
 *      không áp dụng mục này.)
 *
 * CÁCH SỬA
 *   - Thêm index IX_class_sessions_date, IX_lecass_lecturer, IX_lecass_course.
 *   - Thêm CHECK enum cho 5 cột status nêu trên (dùng WITH CHECK — có validate
 *     dữ liệu hiện có; nếu migration lỗi do dữ liệu cũ sai định dạng, chạy
 *     trước: SELECT DISTINCT status FROM <bảng> để tìm giá trị lệch rồi sửa
 *     tay trước khi chạy lại).
 *
 * Script idempotent (IF NOT EXISTS), chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. class_sessions.session_date — phục vụ dashboard "lịch học 7 ngày tới"
--    (không lọc theo course_id nên index (course_id, session_date) sẵn có
--    không dùng được)
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_class_sessions_date'
               AND object_id = OBJECT_ID('dbo.class_sessions'))
    CREATE NONCLUSTERED INDEX [IX_class_sessions_date] ON [dbo].[class_sessions]
    (
        [session_date] ASC
    )
    INCLUDE ([course_id], [subject_id], [lecturer_id], [start_time], [end_time], [room]);
GO

------------------------------------------------------------------------------
-- 2. lecturer_assignments.lecturer_id — phục vụ kiểm tra "giảng viên đã được
--    phân công chưa" trước khi xoá/vô hiệu hoá giảng viên
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_lecass_lecturer'
               AND object_id = OBJECT_ID('dbo.lecturer_assignments'))
    CREATE NONCLUSTERED INDEX [IX_lecass_lecturer] ON [dbo].[lecturer_assignments]
    (
        [lecturer_id] ASC
    );
GO

------------------------------------------------------------------------------
-- 3. lecturer_assignments.course_id — có ON DELETE CASCADE từ courses
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_lecass_course'
               AND object_id = OBJECT_ID('dbo.lecturer_assignments'))
    CREATE NONCLUSTERED INDEX [IX_lecass_course] ON [dbo].[lecturer_assignments]
    (
        [course_id] ASC
    );
GO

------------------------------------------------------------------------------
-- 4. CHECK enum cho các cột status còn thiếu trong module Đào tạo
--    (đối chiếu client/src/features/course/types/course.type.ts)
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_courses_status')
    ALTER TABLE [dbo].[courses] WITH CHECK ADD CONSTRAINT [CHK_courses_status]
        CHECK ([status] IN ('draft','open','closed','completed','cancelled'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_course_enrollments_status')
    ALTER TABLE [dbo].[course_enrollments] WITH CHECK ADD CONSTRAINT [CHK_course_enrollments_status]
        CHECK ([status] IN ('pending','approved','rejected','waitlisted'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_course_programs_status')
    ALTER TABLE [dbo].[course_programs] WITH CHECK ADD CONSTRAINT [CHK_course_programs_status]
        CHECK ([status] IN ('active','inactive'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_attendance_status')
    ALTER TABLE [dbo].[attendance] WITH CHECK ADD CONSTRAINT [CHK_attendance_status]
        CHECK ([status] IN ('present','absent','late'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_certificates_status')
    ALTER TABLE [dbo].[certificates] WITH CHECK ADD CONSTRAINT [CHK_certificates_status]
        CHECK ([status] IN ('active','revoked'));
GO

/* --------------------------------------------------------------------------
 * Nếu bước 4 báo lỗi "The ALTER TABLE statement conflicted with the CHECK
 * constraint", nghĩa là đang có dữ liệu cũ mang giá trị status không thuộc
 * danh sách trên. Chạy để tìm bản ghi lệch trước khi chạy lại migration:
 *
 *   SELECT status, COUNT(*) FROM courses GROUP BY status;
 *   SELECT status, COUNT(*) FROM course_enrollments GROUP BY status;
 *   SELECT status, COUNT(*) FROM course_programs GROUP BY status;
 *   SELECT status, COUNT(*) FROM attendance GROUP BY status;
 *   SELECT status, COUNT(*) FROM certificates GROUP BY status;
 * ------------------------------------------------------------------------*/
