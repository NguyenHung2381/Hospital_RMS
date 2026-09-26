/* ============================================================================
 * Vận hành khóa học (Giai đoạn 4): đợt đào tạo, khóa học, đăng ký, phân công
 * giảng viên, lịch học, điểm danh
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Tiếp nối nền tảng Giai đoạn 3 (trainees/training_programs/subjects/
 *   lecturers). Đối chiếu QLNCKHDTCDT-main: bản gốc có lớp bridge trung gian
 *   `khoa_hoc_chuong_trinh` (khóa học × chương trình) khá rối — tự nhận trong
 *   docs/database.md là khó hiểu. Ở đây ĐƠN GIẢN HÓA: 1 khóa học gắn trực tiếp
 *   1 chương trình + 1 đợt đào tạo, không qua bridge; nếu sau này thực sự cần
 *   dùng chung 1 course cho nhiều chương trình mới bổ sung bridge.
 *
 *   Tương tự, bản gốc dùng 1 engine "đợt & giai đoạn" (4 loại mốc: Submit/Edit/
 *   Supplement/Review) type y hệt NCKH cho cả đào tạo. Ở đây training_rounds
 *   chỉ cần MỘT cửa sổ "đăng ký khóa học" (enrollment_start/end_date ngay trên
 *   bảng round) — không cần bảng deadlines riêng như round_deadlines của NCKH,
 *   vì khóa học chưa có quy trình nhiều giai đoạn (nộp/sửa/bổ sung/nghiệm thu)
 *   như đề tài. Nếu nghiệp vụ đào tạo sau này phức tạp hơn, có thể tách ra
 *   bảng training_round_deadlines mirror round_deadlines lúc đó.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Đợt đào tạo (đơn giản hơn research_rounds — không cần round_number/
--    round_type_id/public_token vì chưa có luồng đăng ký công khai ở giai
--    đoạn này).
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.training_rounds', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[training_rounds] (
        [id]                    VARCHAR(20)   NOT NULL PRIMARY KEY,
        [name]                  NVARCHAR(200) NOT NULL,
        [year]                  INT           NOT NULL,
        [start_date]            DATE          NOT NULL,
        [end_date]              DATE          NOT NULL,
        [enrollment_start_date] DATE          NULL,
        [enrollment_end_date]   DATE          NULL,
        [status]                VARCHAR(10)   NOT NULL CONSTRAINT DF_training_rounds_status DEFAULT ('draft'),
        [created_at]            DATETIME      NOT NULL CONSTRAINT DF_training_rounds_created_at DEFAULT (GETDATE()),
        [created_by]            VARCHAR(20)   NULL,
        [updated_at]            DATETIME      NULL,
        [updated_by]            VARCHAR(20)   NULL
    );
END
GO

------------------------------------------------------------------------------
-- 2. Khóa học — gắn trực tiếp 1 chương trình + 1 đợt (xem giải thích ở đầu file)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.courses', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[courses] (
        [id]                VARCHAR(20)    NOT NULL PRIMARY KEY,
        [name]              NVARCHAR(255)  NOT NULL,
        [program_id]        VARCHAR(20)    NULL,
        [training_round_id] VARCHAR(20)    NULL,
        [training_form_id]  VARCHAR(20)    NULL,
        [start_date]        DATE           NULL,
        [end_date]          DATE           NULL,
        [capacity]          INT            NULL,
        [status]            VARCHAR(15)    NOT NULL CONSTRAINT DF_courses_status DEFAULT ('draft'),
        [description]       NVARCHAR(MAX)  NULL,
        [created_at]        DATETIME       NOT NULL CONSTRAINT DF_courses_created_at DEFAULT (GETDATE()),
        [created_by]        VARCHAR(20)    NULL,
        [updated_at]        DATETIME       NULL,
        [updated_by]        VARCHAR(20)    NULL,
        CONSTRAINT FK_courses_program FOREIGN KEY ([program_id])        REFERENCES [dbo].[training_programs] ([id]),
        CONSTRAINT FK_courses_round   FOREIGN KEY ([training_round_id]) REFERENCES [dbo].[training_rounds]   ([id]),
        CONSTRAINT FK_courses_form    FOREIGN KEY ([training_form_id])  REFERENCES [dbo].[training_forms]    ([id])
    );
    CREATE NONCLUSTERED INDEX [IX_courses_round] ON [dbo].[courses] ([training_round_id]);
    CREATE NONCLUSTERED INDEX [IX_courses_program] ON [dbo].[courses] ([program_id]);
END
GO

------------------------------------------------------------------------------
-- 3. Đăng ký khóa học — 1 học viên chỉ đăng ký 1 lần / khóa (UNIQUE)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.course_enrollments', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[course_enrollments] (
        [id]           VARCHAR(20)  NOT NULL PRIMARY KEY,
        [course_id]    VARCHAR(20)  NOT NULL,
        [trainee_id]   VARCHAR(20)  NOT NULL,
        [status]       VARCHAR(15)  NOT NULL CONSTRAINT DF_course_enrollments_status DEFAULT ('pending'),
        [registered_at] DATETIME    NOT NULL CONSTRAINT DF_course_enrollments_registered_at DEFAULT (GETDATE()),
        [decided_by]   VARCHAR(20)  NULL,
        [decided_at]   DATETIME     NULL,
        [note]         NVARCHAR(500) NULL,
        CONSTRAINT FK_enroll_course  FOREIGN KEY ([course_id])  REFERENCES [dbo].[courses]  ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_enroll_trainee FOREIGN KEY ([trainee_id]) REFERENCES [dbo].[trainees] ([id]),
        CONSTRAINT UQ_enroll_course_trainee UNIQUE ([course_id], [trainee_id])
    );
END
GO

------------------------------------------------------------------------------
-- 4. Phân công giảng viên cho khóa học (theo môn học, nếu có)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.lecturer_assignments', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[lecturer_assignments] (
        [id]          VARCHAR(20) NOT NULL PRIMARY KEY,
        [course_id]   VARCHAR(20) NOT NULL,
        [lecturer_id] VARCHAR(20) NOT NULL,
        [subject_id]  VARCHAR(20) NULL,
        [note]        NVARCHAR(255) NULL,
        [created_at]  DATETIME    NOT NULL CONSTRAINT DF_lecturer_assignments_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20) NULL,
        CONSTRAINT FK_lecass_course   FOREIGN KEY ([course_id])   REFERENCES [dbo].[courses]   ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_lecass_lecturer FOREIGN KEY ([lecturer_id]) REFERENCES [dbo].[lecturers] ([id]),
        CONSTRAINT FK_lecass_subject  FOREIGN KEY ([subject_id])  REFERENCES [dbo].[subjects]  ([id])
    );
END
GO

------------------------------------------------------------------------------
-- 5. Buổi học (lịch học)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.class_sessions', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[class_sessions] (
        [id]           VARCHAR(20)  NOT NULL PRIMARY KEY,
        [course_id]    VARCHAR(20)  NOT NULL,
        [subject_id]   VARCHAR(20)  NULL,
        [lecturer_id]  VARCHAR(20)  NULL,
        [session_date] DATE         NOT NULL,
        [start_time]   VARCHAR(5)   NULL, -- 'HH:mm', tránh lệch timezone của kiểu TIME
        [end_time]     VARCHAR(5)   NULL,
        [room]         NVARCHAR(100) NULL,
        [created_at]   DATETIME     NOT NULL CONSTRAINT DF_class_sessions_created_at DEFAULT (GETDATE()),
        [created_by]   VARCHAR(20)  NULL,
        [updated_at]   DATETIME     NULL,
        [updated_by]   VARCHAR(20)  NULL,
        CONSTRAINT FK_sess_course   FOREIGN KEY ([course_id])   REFERENCES [dbo].[courses]   ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_sess_subject  FOREIGN KEY ([subject_id])  REFERENCES [dbo].[subjects]  ([id]),
        CONSTRAINT FK_sess_lecturer FOREIGN KEY ([lecturer_id]) REFERENCES [dbo].[lecturers] ([id])
    );
    CREATE NONCLUSTERED INDEX [IX_class_sessions_course] ON [dbo].[class_sessions] ([course_id], [session_date]);
END
GO

------------------------------------------------------------------------------
-- 6. Điểm danh — 1 dòng / (buổi học, học viên đã đăng ký)
--    LƯU Ý: chỉ CASCADE theo session_id. courses -> class_sessions -> attendance
--    và courses -> course_enrollments -> attendance là 2 đường cascade cùng
--    hội tụ về attendance — SQL Server không cho phép 2 đường CASCADE cùng tới
--    1 bảng ("multiple cascade paths"), nên enrollment_id để NO ACTION (mặc
--    định) và tự xoá attendance theo enrollment_id ở tầng service
--    (courseService.removeEnrollment) trước khi xoá dòng course_enrollments.
--    Khi xoá cả course, nhánh session_id đã dọn sạch attendance trước nên
--    nhánh course_enrollments không còn gì để chặn.
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.attendance', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[attendance] (
        [id]            VARCHAR(20) NOT NULL PRIMARY KEY,
        [session_id]    VARCHAR(20) NOT NULL,
        [enrollment_id] VARCHAR(20) NOT NULL,
        [status]        VARCHAR(10) NOT NULL CONSTRAINT DF_attendance_status DEFAULT ('absent'),
        [note]          NVARCHAR(255) NULL,
        [updated_at]    DATETIME    NULL,
        [updated_by]    VARCHAR(20) NULL,
        CONSTRAINT FK_att_session    FOREIGN KEY ([session_id])    REFERENCES [dbo].[class_sessions]     ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_att_enrollment FOREIGN KEY ([enrollment_id]) REFERENCES [dbo].[course_enrollments] ([id]),
        CONSTRAINT UQ_att_session_enrollment UNIQUE ([session_id], [enrollment_id])
    );
END
GO

------------------------------------------------------------------------------
-- 7. Quyền mới — gộp theo cụm chức năng (mirror cách 'councils' gộp cả
--    council_members/council_progress_reviews vào 1 resource), tránh phình
--    ma trận phân quyền với quá nhiều resource nhỏ lẻ.
--    - training_rounds: đợt đào tạo
--    - courses: khóa học + đăng ký + phân công giảng viên + lịch học + điểm danh
------------------------------------------------------------------------------
MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-TRND-READ',   N'Xem đợt đào tạo',        N'Xem danh sách đợt đào tạo',            'training_rounds', 'read',   10),
    ('PERM-TRND-CREATE', N'Thêm đợt đào tạo',       N'Tạo đợt đào tạo mới',                   'training_rounds', 'create', 20),
    ('PERM-TRND-UPDATE', N'Sửa đợt đào tạo',        N'Cập nhật đợt đào tạo',                  'training_rounds', 'update', 30),
    ('PERM-TRND-DELETE', N'Xoá đợt đào tạo',        N'Xoá đợt đào tạo',                       'training_rounds', 'delete', 40),
    ('PERM-TRND-MANAGE', N'Toàn quyền đợt đào tạo', N'Toàn quyền quản lý đợt đào tạo',        'training_rounds', 'manage', 50),

    ('PERM-CRS-READ',    N'Xem khóa học',           N'Xem khóa học, đăng ký, lịch học, điểm danh', 'courses', 'read',    10),
    ('PERM-CRS-CREATE',  N'Thêm khóa học',          N'Tạo khóa học, phân công giảng viên, lịch học', 'courses', 'create', 20),
    ('PERM-CRS-UPDATE',  N'Sửa khóa học',           N'Cập nhật khóa học, lịch học, điểm danh', 'courses', 'update',  30),
    ('PERM-CRS-DELETE',  N'Xoá khóa học',           N'Xoá khóa học, buổi học, phân công',      'courses', 'delete',  40),
    ('PERM-CRS-APPROVE', N'Duyệt đăng ký khóa học', N'Duyệt / từ chối đăng ký khóa học của học viên', 'courses', 'approve', 50),
    ('PERM-CRS-MANAGE',  N'Toàn quyền khóa học',    N'Toàn quyền quản lý khóa học',            'courses', 'manage',  60)
) AS src (id, name, description, resource, action, sort_order)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, sort_order, created_at, created_by, resource, action)
    VALUES (src.id, src.name, src.description, src.sort_order, GETDATE(), N'SYSTEM', src.resource, src.action)
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description, sort_order = src.sort_order;
GO

MERGE [dbo].[role_permissions] AS tgt
USING (VALUES
    ('VT01','PERM-TRND-READ'),('VT01','PERM-TRND-CREATE'),('VT01','PERM-TRND-UPDATE'),('VT01','PERM-TRND-DELETE'),('VT01','PERM-TRND-MANAGE'),
    ('VT01','PERM-CRS-READ'),('VT01','PERM-CRS-CREATE'),('VT01','PERM-CRS-UPDATE'),('VT01','PERM-CRS-DELETE'),('VT01','PERM-CRS-APPROVE'),('VT01','PERM-CRS-MANAGE'),

    ('VT03','PERM-TRND-READ'),('VT03','PERM-TRND-CREATE'),('VT03','PERM-TRND-UPDATE'),('VT03','PERM-TRND-DELETE'),('VT03','PERM-TRND-MANAGE'),
    ('VT03','PERM-CRS-READ'),('VT03','PERM-CRS-CREATE'),('VT03','PERM-CRS-UPDATE'),('VT03','PERM-CRS-DELETE'),('VT03','PERM-CRS-APPROVE'),('VT03','PERM-CRS-MANAGE')
) AS src (role_id, permission_id)
ON tgt.role_id = src.role_id AND tgt.permission_id = src.permission_id
WHEN NOT MATCHED BY TARGET
     AND EXISTS (SELECT 1 FROM [dbo].[roles] r WHERE r.id = src.role_id)
     AND EXISTS (SELECT 1 FROM [dbo].[permissions] p WHERE p.id = src.permission_id) THEN
    INSERT (role_id, permission_id, created_by)
    VALUES (src.role_id, src.permission_id, N'SYSTEM');
GO

PRINT N'✅ Migration 2026-09-11_training_operations hoàn tất.';
GO
