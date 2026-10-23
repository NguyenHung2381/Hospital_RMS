/* ============================================================================
 * 2026-12-02_attendance_leave_requests
 * ----------------------------------------------------------------------------
 *   Đơn xin phép của học viên khi có việc đột xuất (module Điểm danh — tên cũ
 *   "Chấm công"):
 *   - type 'absent' : xin nghỉ từ from_date tới to_date (cả ngày, hoặc 1 ca nếu
 *                     shift_id có giá trị và chỉ 1 ngày).
 *   - type 'late'   : xin đi muộn 1 ngày (from_date = to_date), arrive_time =
 *                     giờ dự kiến có mặt 'HH:mm'.
 *   - status        : pending → approved | rejected (người duyệt), hoặc
 *                     cancelled (học viên tự huỷ khi còn chờ duyệt).
 *   course_id / course_name / shift_name: bản chụp lúc gửi đơn (không FK, như
 *   staff_attendance). Đơn được duyệt hiện "Nghỉ có phép" / "Muộn có phép" ở
 *   bảng điểm danh.
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.attendance_leave_requests', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[attendance_leave_requests] (
        [id]           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_attendance_leave_requests PRIMARY KEY,
        [user_id]      VARCHAR(20)    NOT NULL
                       CONSTRAINT FK_attendance_leave_requests_user REFERENCES [dbo].[users](id) ON DELETE CASCADE,
        [type]         VARCHAR(10)    NOT NULL
                       CONSTRAINT CK_attendance_leave_requests_type CHECK ([type] IN ('absent', 'late')),
        [from_date]    DATE           NOT NULL,
        [to_date]      DATE           NOT NULL,
        [shift_id]     INT            NULL,
        [shift_name]   NVARCHAR(100)  NULL,
        [arrive_time]  CHAR(5)        NULL,
        [reason]       NVARCHAR(1000) NOT NULL,
        [course_id]    VARCHAR(20)    NULL,
        [course_name]  NVARCHAR(255)  NULL,
        [status]       VARCHAR(10)    NOT NULL
                       CONSTRAINT DF_attendance_leave_requests_status DEFAULT 'pending'
                       CONSTRAINT CK_attendance_leave_requests_status CHECK ([status] IN ('pending', 'approved', 'rejected', 'cancelled')),
        [review_note]  NVARCHAR(500)  NULL,
        [reviewed_by]  VARCHAR(20)    NULL,
        [reviewed_at]  DATETIME2      NULL,
        [created_at]   DATETIME2      NOT NULL CONSTRAINT DF_attendance_leave_requests_created DEFAULT SYSUTCDATETIME(),
        [created_by]   VARCHAR(20)    NULL,
        [updated_at]   DATETIME2      NULL,
        [updated_by]   VARCHAR(20)    NULL,
        CONSTRAINT CK_attendance_leave_requests_dates CHECK ([to_date] >= [from_date])
    );
    CREATE INDEX IX_attendance_leave_requests_user ON [dbo].[attendance_leave_requests](user_id, from_date);
    CREATE INDEX IX_attendance_leave_requests_dates ON [dbo].[attendance_leave_requests](from_date, to_date) INCLUDE (status);
END
GO

PRINT N'✅ Migration 2026-12-02_attendance_leave_requests hoàn tất.';
GO
