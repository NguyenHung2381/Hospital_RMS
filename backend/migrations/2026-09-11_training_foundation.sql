/* ============================================================================
 * Nền tảng module Đào tạo (Giai đoạn 3): danh mục, học viên, chương trình,
 * môn học, giảng viên
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu QLNCKHDTCDT-main (hệ thống NCKH + Đào tạo/CME của Bệnh viện Hữu
 *   nghị Đa khoa Nghệ An): mảng Đào tạo/Khoá học (học viên, khoá học, chương
 *   trình, môn học, giảng viên, lịch học, điểm danh, chứng chỉ...) CHƯA hề tồn
 *   tại trong Hospital_RMS. Migration này dựng NỀN TẢNG — danh mục dùng chung
 *   + 3 thực thể lõi (học viên, chương trình đào tạo, giảng viên) + môn học —
 *   theo đúng convention hiện có (audit columns, resource:action permission),
 *   KHÔNG copy nguyên thiết kế bảng từ PHP nguồn (đã ghi nhận nợ kỹ thuật ở đó:
 *   cột trùng lặp, ENUM lồng nhau, thiếu FK audit).
 *
 *   Vận hành khoá học (courses, đợt đăng ký, lịch học, điểm danh, chứng chỉ...)
 *   sẽ tiếp tục ở migration của Giai đoạn 4-5, xây trên nền các bảng này.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Danh mục dùng chung cho Đào tạo (shape giống categories/levels/round_types
--    hiện có — id/name/description/audit — để dùng chung crudService()).
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.trainee_types', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[trainee_types] (
        [id]          VARCHAR(20)    NOT NULL PRIMARY KEY,
        [name]        NVARCHAR(500)  NOT NULL,
        [description] NVARCHAR(MAX)  NULL,
        [created_at]  DATETIME       NOT NULL CONSTRAINT DF_trainee_types_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20)    NULL,
        [updated_at]  DATETIME       NULL,
        [updated_by]  VARCHAR(20)    NULL
    );
END
GO

IF OBJECT_ID(N'dbo.training_forms', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[training_forms] (
        [id]          VARCHAR(20)    NOT NULL PRIMARY KEY,
        [name]        NVARCHAR(500)  NOT NULL,
        [description] NVARCHAR(MAX)  NULL,
        [created_at]  DATETIME       NOT NULL CONSTRAINT DF_training_forms_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20)    NULL,
        [updated_at]  DATETIME       NULL,
        [updated_by]  VARCHAR(20)    NULL
    );
END
GO

IF OBJECT_ID(N'dbo.training_types', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[training_types] (
        [id]          VARCHAR(20)    NOT NULL PRIMARY KEY,
        [name]        NVARCHAR(500)  NOT NULL,
        [description] NVARCHAR(MAX)  NULL,
        [created_at]  DATETIME       NOT NULL CONSTRAINT DF_training_types_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20)    NULL,
        [updated_at]  DATETIME       NULL,
        [updated_by]  VARCHAR(20)    NULL
    );
END
GO

IF OBJECT_ID(N'dbo.cme_credit_categories', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[cme_credit_categories] (
        [id]          VARCHAR(20)    NOT NULL PRIMARY KEY,
        [name]        NVARCHAR(500)  NOT NULL,
        [description] NVARCHAR(MAX)  NULL,
        [created_at]  DATETIME       NOT NULL CONSTRAINT DF_cme_credit_categories_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20)    NULL,
        [updated_at]  DATETIME       NULL,
        [updated_by]  VARCHAR(20)    NULL
    );
END
GO

IF OBJECT_ID(N'dbo.subjects', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[subjects] (
        [id]          VARCHAR(20)    NOT NULL PRIMARY KEY,
        [name]        NVARCHAR(500)  NOT NULL,
        [description] NVARCHAR(MAX)  NULL,
        [created_at]  DATETIME       NOT NULL CONSTRAINT DF_subjects_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20)    NULL,
        [updated_at]  DATETIME       NULL,
        [updated_by]  VARCHAR(20)    NULL
    );
END
GO

------------------------------------------------------------------------------
-- 2. Học viên (trainees) — thực thể độc lập, KHÔNG bắt buộc có tài khoản đăng
--    nhập (giống topic_members cho phép thành viên ngoài hệ thống).
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.trainees', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[trainees] (
        [id]              VARCHAR(20)   NOT NULL PRIMARY KEY,
        [full_name]       NVARCHAR(150) NOT NULL,
        [dob]             DATE          NULL,
        [gender]          VARCHAR(10)   NULL,
        [national_id]     VARCHAR(20)   NULL,
        [phone]           VARCHAR(20)   NULL,
        [email]           VARCHAR(100)  NULL,
        [address]         NVARCHAR(255) NULL,
        [trainee_type_id] VARCHAR(20)   NULL,
        [department_id]   VARCHAR(20)   NULL,
        [created_at]      DATETIME      NOT NULL CONSTRAINT DF_trainees_created_at DEFAULT (GETDATE()),
        [created_by]      VARCHAR(20)   NULL,
        [updated_at]      DATETIME      NULL,
        [updated_by]      VARCHAR(20)   NULL,
        CONSTRAINT FK_trainees_type       FOREIGN KEY ([trainee_type_id]) REFERENCES [dbo].[trainee_types] ([id]),
        CONSTRAINT FK_trainees_department FOREIGN KEY ([department_id])   REFERENCES [dbo].[departments]   ([id])
    );
    -- CCCD không bắt buộc nhưng nếu có thì không trùng (NULL không tham gia UNIQUE — SQL Server cho phép nhiều NULL).
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_trainees_national_id] ON [dbo].[trainees] ([national_id])
        WHERE [national_id] IS NOT NULL;
END
GO

------------------------------------------------------------------------------
-- 3. Chương trình đào tạo & môn học (N:N qua program_subjects)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.training_programs', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[training_programs] (
        [id]                VARCHAR(20)   NOT NULL PRIMARY KEY,
        [name]              NVARCHAR(255) NOT NULL,
        [department_id]     VARCHAR(20)   NULL,
        [trainee_type_id]   VARCHAR(20)   NULL,
        [training_type_id]  VARCHAR(20)   NULL,
        [description]       NVARCHAR(MAX) NULL,
        [created_at]        DATETIME      NOT NULL CONSTRAINT DF_training_programs_created_at DEFAULT (GETDATE()),
        [created_by]        VARCHAR(20)   NULL,
        [updated_at]        DATETIME      NULL,
        [updated_by]        VARCHAR(20)   NULL,
        CONSTRAINT FK_trprog_department FOREIGN KEY ([department_id])    REFERENCES [dbo].[departments]      ([id]),
        CONSTRAINT FK_trprog_trnstype   FOREIGN KEY ([trainee_type_id])  REFERENCES [dbo].[trainee_types]     ([id]),
        CONSTRAINT FK_trprog_trntype    FOREIGN KEY ([training_type_id]) REFERENCES [dbo].[training_types]    ([id])
    );
END
GO

IF OBJECT_ID(N'dbo.program_subjects', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[program_subjects] (
        [program_id] VARCHAR(20) NOT NULL,
        [subject_id] VARCHAR(20) NOT NULL,
        CONSTRAINT PK_program_subjects PRIMARY KEY ([program_id], [subject_id]),
        CONSTRAINT FK_prsub_program FOREIGN KEY ([program_id]) REFERENCES [dbo].[training_programs] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_prsub_subject FOREIGN KEY ([subject_id]) REFERENCES [dbo].[subjects]           ([id]) ON DELETE CASCADE
    );
END
GO

------------------------------------------------------------------------------
-- 4. Giảng viên — mirror pattern external_reviewers (người ngoài viện cho hội
--    đồng): user_id NULL cho phép giảng viên nội bộ (liên kết users) hoặc
--    giảng viên mời ngoài (is_external = 1, không có tài khoản).
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.lecturers', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[lecturers] (
        [id]          VARCHAR(20)   NOT NULL PRIMARY KEY,
        [user_id]     VARCHAR(20)   NULL,
        [full_name]   NVARCHAR(150) NOT NULL,
        [specialty]   NVARCHAR(150) NULL,
        [is_external] BIT           NOT NULL CONSTRAINT DF_lecturers_is_external DEFAULT (0),
        [phone]       VARCHAR(20)   NULL,
        [email]       VARCHAR(100)  NULL,
        [is_active]   BIT           NOT NULL CONSTRAINT DF_lecturers_is_active DEFAULT (1),
        [created_at]  DATETIME      NOT NULL CONSTRAINT DF_lecturers_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20)   NULL,
        [updated_at]  DATETIME      NULL,
        [updated_by]  VARCHAR(20)   NULL,
        CONSTRAINT FK_lecturers_user FOREIGN KEY ([user_id]) REFERENCES [dbo].[users] ([id])
    );
END
GO

------------------------------------------------------------------------------
-- 5. Quyền mới — resource riêng cho từng nhóm chức năng (mirror cách 'councils'
--    / 'topics' đã làm), KHÔNG dùng chung 1 resource "training" duy nhất để
--    còn cấp quyền chi tiết theo từng màn hình sau này.
------------------------------------------------------------------------------
MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-TRNCAT-READ',   N'Xem danh mục đào tạo',        N'Xem đối tượng học viên, hình thức học, loại hình đào tạo, môn học, danh mục quy đổi CME', 'training_catalog', 'read',   10),
    ('PERM-TRNCAT-CREATE', N'Thêm danh mục đào tạo',       N'Tạo mục danh mục đào tạo mới',                                                            'training_catalog', 'create', 20),
    ('PERM-TRNCAT-UPDATE', N'Sửa danh mục đào tạo',        N'Cập nhật mục danh mục đào tạo',                                                           'training_catalog', 'update', 30),
    ('PERM-TRNCAT-DELETE', N'Xoá danh mục đào tạo',        N'Xoá mục danh mục đào tạo',                                                                'training_catalog', 'delete', 40),
    ('PERM-TRNCAT-MANAGE', N'Toàn quyền danh mục đào tạo', N'Toàn quyền quản lý danh mục đào tạo',                                                     'training_catalog', 'manage', 50),

    ('PERM-TRN-READ',        N'Xem học viên',           N'Xem danh sách và chi tiết học viên',                    'trainees', 'read',           10),
    ('PERM-TRN-CREATE',      N'Thêm học viên',          N'Tạo hồ sơ học viên mới',                                'trainees', 'create',         20),
    ('PERM-TRN-UPDATE',      N'Sửa học viên',           N'Cập nhật hồ sơ học viên',                               'trainees', 'update',         30),
    ('PERM-TRN-DELETE',      N'Xoá học viên',           N'Xoá hồ sơ học viên',                                    'trainees', 'delete',         40),
    ('PERM-TRN-IMPORT',      N'Nhập Excel học viên',    N'Nhập danh sách học viên hàng loạt từ file Excel',       'trainees', 'import',         50),
    ('PERM-TRN-READSENS',    N'Xem dữ liệu nhạy cảm học viên', N'Xem đầy đủ CCCD và tệp hồ sơ nhạy cảm (không bị che)', 'trainees', 'read_sensitive', 60),
    ('PERM-TRN-MANAGE',      N'Toàn quyền học viên',    N'Toàn quyền quản lý học viên',                           'trainees', 'manage',         70),

    ('PERM-TRPROG-READ',   N'Xem chương trình đào tạo',        N'Xem chương trình đào tạo và môn học',        'training_programs', 'read',   10),
    ('PERM-TRPROG-CREATE', N'Thêm chương trình đào tạo',       N'Tạo chương trình đào tạo mới',                'training_programs', 'create', 20),
    ('PERM-TRPROG-UPDATE', N'Sửa chương trình đào tạo',        N'Cập nhật chương trình đào tạo',               'training_programs', 'update', 30),
    ('PERM-TRPROG-DELETE', N'Xoá chương trình đào tạo',        N'Xoá chương trình đào tạo',                    'training_programs', 'delete', 40),
    ('PERM-TRPROG-MANAGE', N'Toàn quyền chương trình đào tạo', N'Toàn quyền quản lý chương trình đào tạo',     'training_programs', 'manage', 50),

    ('PERM-LEC-READ',   N'Xem giảng viên',        N'Xem danh sách giảng viên',        'lecturers', 'read',   10),
    ('PERM-LEC-CREATE', N'Thêm giảng viên',       N'Tạo giảng viên mới',              'lecturers', 'create', 20),
    ('PERM-LEC-UPDATE', N'Sửa giảng viên',        N'Cập nhật thông tin giảng viên',   'lecturers', 'update', 30),
    ('PERM-LEC-DELETE', N'Xoá giảng viên',        N'Xoá giảng viên',                  'lecturers', 'delete', 40),
    ('PERM-LEC-MANAGE', N'Toàn quyền giảng viên', N'Toàn quyền quản lý giảng viên',   'lecturers', 'manage', 50)
) AS src (id, name, description, resource, action, sort_order)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, sort_order, created_at, created_by, resource, action)
    VALUES (src.id, src.name, src.description, src.sort_order, GETDATE(), N'SYSTEM', src.resource, src.action)
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description, sort_order = src.sort_order;
GO

------------------------------------------------------------------------------
-- 6. Gán quyền: VT01 (admin) toàn bộ; VT03 (cán bộ NCKH) kiêm quản lý đào tạo
--    theo đề xuất trong kế hoạch — có thể tách vai trò riêng sau nếu cần.
------------------------------------------------------------------------------
MERGE [dbo].[role_permissions] AS tgt
USING (VALUES
    ('VT01','PERM-TRNCAT-READ'),('VT01','PERM-TRNCAT-CREATE'),('VT01','PERM-TRNCAT-UPDATE'),('VT01','PERM-TRNCAT-DELETE'),('VT01','PERM-TRNCAT-MANAGE'),
    ('VT01','PERM-TRN-READ'),('VT01','PERM-TRN-CREATE'),('VT01','PERM-TRN-UPDATE'),('VT01','PERM-TRN-DELETE'),('VT01','PERM-TRN-IMPORT'),('VT01','PERM-TRN-READSENS'),('VT01','PERM-TRN-MANAGE'),
    ('VT01','PERM-TRPROG-READ'),('VT01','PERM-TRPROG-CREATE'),('VT01','PERM-TRPROG-UPDATE'),('VT01','PERM-TRPROG-DELETE'),('VT01','PERM-TRPROG-MANAGE'),
    ('VT01','PERM-LEC-READ'),('VT01','PERM-LEC-CREATE'),('VT01','PERM-LEC-UPDATE'),('VT01','PERM-LEC-DELETE'),('VT01','PERM-LEC-MANAGE'),

    ('VT03','PERM-TRNCAT-READ'),('VT03','PERM-TRNCAT-CREATE'),('VT03','PERM-TRNCAT-UPDATE'),('VT03','PERM-TRNCAT-DELETE'),('VT03','PERM-TRNCAT-MANAGE'),
    ('VT03','PERM-TRN-READ'),('VT03','PERM-TRN-CREATE'),('VT03','PERM-TRN-UPDATE'),('VT03','PERM-TRN-DELETE'),('VT03','PERM-TRN-IMPORT'),('VT03','PERM-TRN-READSENS'),('VT03','PERM-TRN-MANAGE'),
    ('VT03','PERM-TRPROG-READ'),('VT03','PERM-TRPROG-CREATE'),('VT03','PERM-TRPROG-UPDATE'),('VT03','PERM-TRPROG-DELETE'),('VT03','PERM-TRPROG-MANAGE'),
    ('VT03','PERM-LEC-READ'),('VT03','PERM-LEC-CREATE'),('VT03','PERM-LEC-UPDATE'),('VT03','PERM-LEC-DELETE'),('VT03','PERM-LEC-MANAGE')
) AS src (role_id, permission_id)
ON tgt.role_id = src.role_id AND tgt.permission_id = src.permission_id
WHEN NOT MATCHED BY TARGET
     AND EXISTS (SELECT 1 FROM [dbo].[roles] r WHERE r.id = src.role_id)
     AND EXISTS (SELECT 1 FROM [dbo].[permissions] p WHERE p.id = src.permission_id) THEN
    INSERT (role_id, permission_id, created_by)
    VALUES (src.role_id, src.permission_id, N'SYSTEM');
GO

PRINT N'✅ Migration 2026-09-11_training_foundation hoàn tất.';
GO
