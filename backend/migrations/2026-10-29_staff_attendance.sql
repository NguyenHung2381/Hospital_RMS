/* ============================================================================
 * Chấm công nhân viên hằng ngày (IP mạng bệnh viện + GPS trong bán kính)
 * ----------------------------------------------------------------------------
 *   1 dòng / người / ngày: giờ vào = lần chấm đầu, giờ ra = lần chấm cuối.
 *   Lưu IP và khoảng cách tới bệnh viện (m) lúc chấm để đối chiếu khi khiếu nại
 *   — không lưu toạ độ thô.
 *   Server cũng tự chạy tương đương lúc khởi động (permissions/migrations.js).
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.staff_attendance', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[staff_attendance] (
        [id]                   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_staff_attendance PRIMARY KEY,
        [user_id]              VARCHAR(20) NOT NULL
                               CONSTRAINT FK_staff_attendance_user REFERENCES [dbo].[users](id) ON DELETE CASCADE,
        [work_date]            DATE        NOT NULL,
        [check_in_at]          DATETIME2   NOT NULL,
        [check_in_ip]          VARCHAR(45) NULL,
        [check_in_distance_m]  INT         NULL,
        [check_out_at]         DATETIME2   NULL,
        [check_out_ip]         VARCHAR(45) NULL,
        [check_out_distance_m] INT         NULL,
        CONSTRAINT UQ_staff_attendance_user_date UNIQUE (user_id, work_date)
    );
    CREATE INDEX IX_staff_attendance_date ON [dbo].[staff_attendance](work_date);
END
GO

PRINT N'✅ Migration 2026-10-29_staff_attendance hoàn tất.';
GO
