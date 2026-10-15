/* ============================================================================
 * Chấm công theo ca làm việc
 * ----------------------------------------------------------------------------
 *   work_shifts        Ca làm: giờ vào/ra (end <= start = qua đêm, bằng nhau = 24 giờ),
 *                      khoảng được chấm vào sớm / chấm ra muộn, du di đi muộn/về sớm.
 *   shift_patterns     Mẫu ca tuần: days = JSON {"1":[shift_id…],…,"7":[…]} (1 = Thứ 2).
 *                      users.shift_pattern_id = mẫu của từng người; NULL = mẫu mặc định
 *                      (is_default = 1, tối đa 1 mẫu).
 *   shift_assignments  Phân ca theo ngày, ghi đè mẫu tuần của ngày đó. shift_id NULL = nghỉ.
 *   staff_attendance   Thêm shift_id + ảnh chụp giờ ca lúc chấm + phút đi muộn/về sớm;
 *                      1 dòng / người / ngày bắt đầu ca / ca (shift_id NULL = chấm tự do).
 *   Không có mẫu lẫn phân ca = chấm tự do như trước.
 *   Server cũng tự chạy tương đương lúc khởi động (permissions/migrations.js).
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.work_shifts', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[work_shifts] (
        [id]                 INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_work_shifts PRIMARY KEY,
        [name]               NVARCHAR(100) NOT NULL,
        [code]               NVARCHAR(10)  NOT NULL,
        [color]              VARCHAR(20)   NULL,
        [start_time]         CHAR(5)       NOT NULL,
        [end_time]           CHAR(5)       NOT NULL,
        [checkin_before_min] INT           NOT NULL CONSTRAINT DF_work_shifts_before DEFAULT 30,
        [checkout_after_min] INT           NOT NULL CONSTRAINT DF_work_shifts_after DEFAULT 120,
        [grace_min]          INT           NOT NULL CONSTRAINT DF_work_shifts_grace DEFAULT 5,
        [is_active]          BIT           NOT NULL CONSTRAINT DF_work_shifts_active DEFAULT 1,
        [created_at]         DATETIME2     NOT NULL CONSTRAINT DF_work_shifts_created DEFAULT SYSUTCDATETIME(),
        [updated_at]         DATETIME2     NULL
    );
END
GO

IF OBJECT_ID(N'dbo.shift_patterns', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[shift_patterns] (
        [id]         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_shift_patterns PRIMARY KEY,
        [name]       NVARCHAR(100) NOT NULL,
        [days]       NVARCHAR(MAX) NOT NULL,
        [is_default] BIT           NOT NULL CONSTRAINT DF_shift_patterns_default DEFAULT 0,
        [created_at] DATETIME2     NOT NULL CONSTRAINT DF_shift_patterns_created DEFAULT SYSUTCDATETIME(),
        [updated_at] DATETIME2     NULL
    );
    CREATE UNIQUE INDEX UX_shift_patterns_default ON [dbo].[shift_patterns](is_default) WHERE is_default = 1;
END
GO

IF COL_LENGTH(N'dbo.users', N'shift_pattern_id') IS NULL
    ALTER TABLE [dbo].[users] ADD [shift_pattern_id] INT NULL
        CONSTRAINT FK_users_shift_pattern REFERENCES [dbo].[shift_patterns](id) ON DELETE SET NULL;
GO

IF OBJECT_ID(N'dbo.shift_assignments', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[shift_assignments] (
        [id]         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_shift_assignments PRIMARY KEY,
        [user_id]    VARCHAR(20) NOT NULL
                     CONSTRAINT FK_shift_assignments_user REFERENCES [dbo].[users](id) ON DELETE CASCADE,
        [work_date]  DATE        NOT NULL,
        [shift_id]   INT         NULL
                     CONSTRAINT FK_shift_assignments_shift REFERENCES [dbo].[work_shifts](id),
        [updated_by] VARCHAR(20) NULL,
        [updated_at] DATETIME2   NOT NULL CONSTRAINT DF_shift_assignments_updated DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_shift_assignments UNIQUE (user_id, work_date, shift_id)
    );
    CREATE INDEX IX_shift_assignments_date ON [dbo].[shift_assignments](work_date);
END
GO

IF COL_LENGTH(N'dbo.staff_attendance', N'shift_id') IS NULL
    ALTER TABLE [dbo].[staff_attendance] ADD
        [shift_id]       INT           NULL,
        [shift_name]     NVARCHAR(100) NULL,
        [shift_code]     NVARCHAR(10)  NULL,
        [shift_start_at] DATETIME2     NULL,
        [shift_end_at]   DATETIME2     NULL,
        [late_min]       INT           NULL,
        [early_min]      INT           NULL;
GO

IF OBJECT_ID(N'dbo.UQ_staff_attendance_user_date', N'UQ') IS NOT NULL
    ALTER TABLE [dbo].[staff_attendance] DROP CONSTRAINT UQ_staff_attendance_user_date;
IF OBJECT_ID(N'dbo.UQ_staff_attendance_user_date_shift', N'UQ') IS NULL
    ALTER TABLE [dbo].[staff_attendance] ADD CONSTRAINT UQ_staff_attendance_user_date_shift UNIQUE (user_id, work_date, shift_id);
GO

PRINT N'✅ Migration 2026-10-30_attendance_shifts hoàn tất.';
GO
