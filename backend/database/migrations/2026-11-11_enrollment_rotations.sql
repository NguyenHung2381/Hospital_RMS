/* ============================================================================
 * Đào tạo GĐ4 — Vòng thực hành GPHN của từng học viên (khoa, ngày, NHD)
 * ----------------------------------------------------------------------------
 * Xem docs/ke-hoach-sua-dao-tao.md mục 4.5. Mỗi lượt ghi danh GPHN có các vòng
 * sinh từ bài học loại 'rotation' của chương trình (lesson_programs). Vòng
 * allow_split (chuyên khoa lẻ) có nhiều dòng — mỗi khoa 1 dòng.
 *
 * Thông tin người hướng dẫn (NHD) lưu BẢN CHỤP tại lúc phân công (tên, ông/bà,
 * MNV, ngày sinh, trình độ, số CCHN, ngày cấp, điện thoại, phạm vi HĐCM): phiếu
 * nhận xét / quyết định đã ký phải giữ đúng thông tin tại thời điểm đó dù hồ sơ
 * CCHN đổi sau này. Học lại vòng không đạt = dòng mới, attempt_no + 1.
 *
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.enrollment_rotations', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[enrollment_rotations] (
        [id]                  VARCHAR(20)    NOT NULL PRIMARY KEY,
        [enrollment_id]       VARCHAR(20)    NOT NULL,
        [lesson_id]           VARCHAR(20)    NULL,      -- vòng (program_lessons) — NULL nếu vòng bị xoá khỏi danh mục
        [round_title]         NVARCHAR(255)  NULL,      -- tên vòng lúc tạo (giữ khi vòng bị xoá/đổi tên)
        [seq]                 INT            NOT NULL CONSTRAINT DF_enrrot_seq DEFAULT (0),
        [department_id]       VARCHAR(20)    NULL,
        [department_name]     NVARCHAR(200)  NULL,      -- tên khoa lúc phân công / tên gốc khi nhập sổ cũ
        [start_date]          DATE           NULL,
        [end_date]            DATE           NULL,
        [duration_text]       NVARCHAR(50)   NULL,      -- "03 tháng", "1.5 tuần"
        [mentor_user_id]      VARCHAR(20)    NULL,
        [mentor_name]         NVARCHAR(150)  NULL,
        [mentor_salutation]   NVARCHAR(10)   NULL,      -- ông / bà
        [mentor_staff_no]     NVARCHAR(20)   NULL,
        [mentor_dob]          DATE           NULL,
        [mentor_qualification] NVARCHAR(200) NULL,
        [mentor_license_no]   NVARCHAR(50)   NULL,
        [mentor_license_date] DATE           NULL,
        [mentor_phone]        NVARCHAR(30)   NULL,
        [mentor_scope]        NVARCHAR(1000) NULL,      -- phạm vi hoạt động chuyên môn
        [result]              VARCHAR(10)    NOT NULL CONSTRAINT DF_enrrot_result DEFAULT ('pending'),
        [attempt_no]          INT            NOT NULL CONSTRAINT DF_enrrot_attempt DEFAULT (1),
        [note]                NVARCHAR(500)  NULL,
        [created_at]          DATETIME2      NOT NULL CONSTRAINT DF_enrrot_created_at DEFAULT (GETDATE()),
        [created_by]          VARCHAR(20)    NULL,
        [updated_at]          DATETIME2      NULL,
        [updated_by]          VARCHAR(20)    NULL,
        CONSTRAINT FK_enrrot_enrollment FOREIGN KEY ([enrollment_id])  REFERENCES [dbo].[course_enrollments] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_enrrot_lesson     FOREIGN KEY ([lesson_id])      REFERENCES [dbo].[program_lessons]    ([id]) ON DELETE SET NULL,
        CONSTRAINT FK_enrrot_department FOREIGN KEY ([department_id])  REFERENCES [dbo].[departments]        ([id]) ON DELETE SET NULL,
        CONSTRAINT FK_enrrot_mentor     FOREIGN KEY ([mentor_user_id]) REFERENCES [dbo].[users]              ([id]),
        CONSTRAINT CHK_enrrot_result CHECK ([result] IN ('pending', 'pass', 'fail')),
        CONSTRAINT CHK_enrrot_dates CHECK ([start_date] IS NULL OR [end_date] IS NULL OR [end_date] >= [start_date])
    );
    CREATE NONCLUSTERED INDEX [IX_enrrot_enrollment] ON [dbo].[enrollment_rotations] ([enrollment_id], [seq]);
    CREATE NONCLUSTERED INDEX [IX_enrrot_mentor_dates] ON [dbo].[enrollment_rotations] ([mentor_user_id], [start_date], [end_date]);
    CREATE NONCLUSTERED INDEX [IX_enrrot_department_dates] ON [dbo].[enrollment_rotations] ([department_id], [start_date], [end_date]);
END
GO

PRINT N'✅ Migration 2026-11-11_enrollment_rotations hoàn tất.';
GO
