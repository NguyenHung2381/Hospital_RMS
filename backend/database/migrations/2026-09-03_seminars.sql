/* ============================================================================
 * Module Quản lý Hội thảo – Hội nghị & Cấp CME
 * ----------------------------------------------------------------------------
 * - seminars               : sự kiện (BV cử người đi dự / BV tổ chức)
 * - seminar_participants    : người tham dự / được cử đi + thông tin CME
 * - cme_year_register       : bộ đếm số quyết định CME theo NĂM (SQĐ chạy 1..N
 *                             liên tục trong năm, sang năm mới reset về 1)
 *
 * Nghiệp vụ CME KHÔNG liên quan tới nghiên cứu khoa học (không FK research_rounds).
 * SQĐ (cme_certificate_no) là cột tính từ cme_seq, hiển thị "0001".
 *
 * Phân quyền: seed nhóm quyền SEMINAR_MGT + 8 quyền resource 'seminars'
 * (read/create/update/delete/manage/import/export/cme_manage) → hiện trong màn
 * "Vai trò & Quyền" để cấu hình tài khoản nào được truy cập / thao tác.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Bảng seminars
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.seminars', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.seminars (
        id                  VARCHAR(20)   NOT NULL CONSTRAINT PK_seminars PRIMARY KEY,
        title               NVARCHAR(500) NOT NULL,
        event_type          VARCHAR(30)   NOT NULL CONSTRAINT DF_seminars_event_type DEFAULT 'other',
        event_type_raw      NVARCHAR(100) NULL,
        scope               VARCHAR(20)   NOT NULL CONSTRAINT DF_seminars_scope DEFAULT 'external',
        location            NVARCHAR(255) NULL,
        start_date          DATE          NULL,
        end_date            DATE          NULL,
        date_text           NVARCHAR(100) NULL,
        event_year          INT           NULL,
        host_chair          NVARCHAR(255) NULL,
        speakers            NVARCHAR(MAX) NULL,
        permit_doc_no       NVARCHAR(255) NULL,
        co_organizers       NVARCHAR(500) NULL,
        grants_cme          BIT           NOT NULL CONSTRAINT DF_seminars_grants_cme DEFAULT 0,
        cme_default_credits DECIMAL(4,1)  NULL,
        coordinator         NVARCHAR(100) NULL,
        notes               NVARCHAR(MAX) NULL,
        created_at          DATETIME2(7)  NOT NULL CONSTRAINT DF_seminars_created_at DEFAULT GETDATE(),
        created_by          VARCHAR(20)   NULL,
        updated_at          DATETIME2(7)  NULL,
        updated_by          VARCHAR(20)   NULL,
        CONSTRAINT CHK_seminars_scope      CHECK (scope IN ('external','hosted')),
        CONSTRAINT CHK_seminars_event_type CHECK (event_type IN
            ('conference','sci_seminar','intl_seminar','sci_conference','training','other'))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_seminars_scope_type' AND object_id = OBJECT_ID(N'dbo.seminars'))
    CREATE NONCLUSTERED INDEX IX_seminars_scope_type ON dbo.seminars (scope, event_type);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_seminars_event_year' AND object_id = OBJECT_ID(N'dbo.seminars'))
    CREATE NONCLUSTERED INDEX IX_seminars_event_year ON dbo.seminars (event_year);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_seminars_start_date' AND object_id = OBJECT_ID(N'dbo.seminars'))
    CREATE NONCLUSTERED INDEX IX_seminars_start_date ON dbo.seminars (start_date DESC);
GO

------------------------------------------------------------------------------
-- 2. Sổ cấp CME theo năm
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.cme_year_register', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.cme_year_register (
        [year]     INT          NOT NULL CONSTRAINT PK_cme_year_register PRIMARY KEY,
        last_seq   INT          NOT NULL CONSTRAINT DF_cme_year_register_last_seq DEFAULT 0,
        updated_at DATETIME2(7) NOT NULL CONSTRAINT DF_cme_year_register_updated_at DEFAULT GETDATE(),
        updated_by VARCHAR(20)  NULL,
        CONSTRAINT CHK_cme_year_register_year CHECK ([year] BETWEEN 2000 AND 2100),
        CONSTRAINT CHK_cme_year_register_seq  CHECK (last_seq >= 0)
    );
END
GO

------------------------------------------------------------------------------
-- 3. Bảng seminar_participants
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.seminar_participants', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.seminar_participants (
        id                 VARCHAR(24)   NOT NULL CONSTRAINT PK_seminar_participants PRIMARY KEY,
        seminar_id         VARCHAR(20)   NOT NULL,
        user_id            VARCHAR(20)   NULL,
        title_prefix       NVARCHAR(10)  NULL,
        full_name          NVARCHAR(255) NOT NULL,
        dob                DATE          NULL,
        dob_text           NVARCHAR(50)  NULL,
        gender             VARCHAR(10)   NULL,
        organization       NVARCHAR(255) NULL,
        department_raw     NVARCHAR(255) NULL,
        staff_number       INT           NULL,
        qualification_raw  NVARCHAR(100) NULL,
        source             VARCHAR(20)   NOT NULL CONSTRAINT DF_sp_source DEFAULT 'internal',
        is_foreign         BIT           NOT NULL CONSTRAINT DF_sp_is_foreign DEFAULT 0,
        participation_type VARCHAR(20)   NOT NULL CONSTRAINT DF_sp_ptype DEFAULT 'attendee',
        cme_year           INT           NULL,
        cme_seq            INT           NULL,
        cme_certificate_no AS (CASE WHEN cme_seq IS NULL THEN NULL
                                    ELSE RIGHT('0000' + CAST(cme_seq AS VARCHAR(10)), 4) END) PERSISTED,
        cme_credits        DECIMAL(4,1)  NULL,
        cme_status         VARCHAR(15)   NOT NULL CONSTRAINT DF_sp_cme_status DEFAULT 'none',
        cme_issued_date    DATE          NULL,
        notes              NVARCHAR(255) NULL,
        created_at         DATETIME2(7)  NOT NULL CONSTRAINT DF_sp_created_at DEFAULT GETDATE(),
        created_by         VARCHAR(20)   NULL,
        updated_at         DATETIME2(7)  NULL,
        updated_by         VARCHAR(20)   NULL,
        CONSTRAINT FK_sp_seminar FOREIGN KEY (seminar_id) REFERENCES dbo.seminars (id) ON DELETE CASCADE,
        CONSTRAINT FK_sp_user    FOREIGN KEY (user_id)    REFERENCES dbo.users (id),
        CONSTRAINT CHK_sp_source     CHECK (source IN ('internal','external')),
        CONSTRAINT CHK_sp_ptype      CHECK (participation_type IN ('attendee','speaker','chair','organizer','trainee')),
        CONSTRAINT CHK_sp_cme_status CHECK (cme_status IN ('none','pending','issued','signed')),
        CONSTRAINT CHK_sp_cme_pair   CHECK ((cme_seq IS NULL AND cme_year IS NULL)
                                         OR (cme_seq IS NOT NULL AND cme_year IS NOT NULL))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_sp_seminar' AND object_id = OBJECT_ID(N'dbo.seminar_participants'))
    CREATE NONCLUSTERED INDEX IX_sp_seminar ON dbo.seminar_participants (seminar_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_sp_user' AND object_id = OBJECT_ID(N'dbo.seminar_participants'))
    CREATE NONCLUSTERED INDEX IX_sp_user ON dbo.seminar_participants (user_id) WHERE user_id IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_sp_staff_number' AND object_id = OBJECT_ID(N'dbo.seminar_participants'))
    CREATE NONCLUSTERED INDEX IX_sp_staff_number ON dbo.seminar_participants (staff_number) WHERE staff_number IS NOT NULL;
GO
-- SQĐ là dãy duy nhất toàn hệ thống trong 1 năm
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_sp_cme_year_seq' AND object_id = OBJECT_ID(N'dbo.seminar_participants'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_sp_cme_year_seq ON dbo.seminar_participants (cme_year, cme_seq)
        WHERE cme_seq IS NOT NULL;
GO

------------------------------------------------------------------------------
-- 4. Trigger audit (updated_at / updated_by) — mẫu trg_cat_audit
------------------------------------------------------------------------------
-- RECURSIVE_TRIGGERS mặc định OFF → trigger tự UPDATE bảng của mình không tái kích hoạt.
CREATE OR ALTER TRIGGER dbo.trg_seminars_audit ON dbo.seminars AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor VARCHAR(20) = CAST(SESSION_CONTEXT(N'current_user_id') AS VARCHAR(20));
    UPDATE s SET updated_at = GETDATE(), updated_by = @actor
    FROM dbo.seminars s INNER JOIN inserted i ON s.id = i.id
    WHERE NOT UPDATE(updated_at);
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_seminar_participants_audit ON dbo.seminar_participants AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor VARCHAR(20) = CAST(SESSION_CONTEXT(N'current_user_id') AS VARCHAR(20));
    UPDATE p SET updated_at = GETDATE(), updated_by = @actor
    FROM dbo.seminar_participants p INNER JOIN inserted i ON p.id = i.id
    WHERE NOT UPDATE(updated_at);
END;
GO

------------------------------------------------------------------------------
-- 5. sp_gen_cme_no — cấp số quyết định CME kế tiếp cho một năm
--    (mẫu sp_gen_*; @owner NVARCHAR(20) theo bài học 2026-08-28_fix_gen_id_applock_owner)
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_gen_cme_no
    @year INT,
    @actor_id VARCHAR(20) = NULL,
    @new_seq INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    IF @year IS NULL OR @year < 2000 OR @year > 2100
        THROW 50051, N'Năm cấp CME không hợp lệ', 1;

    DECLARE @owner NVARCHAR(20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @lock_res NVARCHAR(64) = N'gen_cme_no_' + CAST(@year AS NVARCHAR(10));
    DECLARE @lock_ret INT;

    EXEC @lock_ret = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive',
         @LockOwner = @owner, @LockTimeout = 15000;
    IF @lock_ret < 0
        THROW 50052, N'Không lấy được khóa sinh số CME, vui lòng thử lại', 1;

    MERGE dbo.cme_year_register AS t
    USING (SELECT @year AS y) AS s ON t.[year] = s.y
    WHEN NOT MATCHED THEN INSERT ([year], last_seq, updated_by) VALUES (s.y, 0, @actor_id);

    UPDATE dbo.cme_year_register
       SET @new_seq = last_seq = last_seq + 1,
           updated_at = GETDATE(), updated_by = @actor_id
     WHERE [year] = @year;

    IF @owner = N'Session'
        EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = @owner;
END;
GO

------------------------------------------------------------------------------
-- 6. Phân quyền — nhóm SEMINAR_MGT + 8 quyền resource 'seminars'
------------------------------------------------------------------------------
DECLARE @grp VARCHAR(10) = N'NQ18';

IF NOT EXISTS (SELECT 1 FROM dbo.permission_groups WHERE code = N'SEMINAR_MGT')
BEGIN
    -- chọn id NQ chưa dùng (mặc định NQ18)
    IF EXISTS (SELECT 1 FROM dbo.permission_groups WHERE id = @grp)
        SELECT @grp = N'NQ' + RIGHT('00' + CAST(MAX(CAST(SUBSTRING(id,3,8) AS INT)) + 1 AS VARCHAR(8)), 2)
        FROM dbo.permission_groups WHERE id LIKE 'NQ[0-9][0-9]';

    INSERT INTO dbo.permission_groups (id, code, name, description, sort_order, created_at, created_by)
    VALUES (@grp, N'SEMINAR_MGT', N'Quản lý Hội thảo, Hội nghị & CME', NULL, 180, GETDATE(), N'SYSTEM');
END
ELSE
    SELECT @grp = id FROM dbo.permission_groups WHERE code = N'SEMINAR_MGT';

MERGE dbo.permissions AS tgt
USING (VALUES
    ('PERM-SEM-READ',       N'Xem hội thảo, hội nghị',   N'Xem danh sách & chi tiết hội thảo/hội nghị và người tham dự', 'seminars', 'read',       10),
    ('PERM-SEM-CREATE',     N'Thêm hội thảo, hội nghị',  N'Tạo mới hội thảo/hội nghị',                                   'seminars', 'create',     20),
    ('PERM-SEM-UPDATE',     N'Sửa hội thảo, hội nghị',   N'Cập nhật hội thảo/hội nghị và danh sách người tham dự',        'seminars', 'update',     30),
    ('PERM-SEM-DELETE',     N'Xóa hội thảo, hội nghị',   N'Xóa hội thảo/hội nghị khỏi hệ thống',                          'seminars', 'delete',     40),
    ('PERM-SEM-MANAGE',     N'Quản lý hội thảo, hội nghị',N'Toàn quyền với hội thảo/hội nghị',                            'seminars', 'manage',     50),
    ('PERM-SEM-IMPORT',     N'Nhập từ Excel',            N'Nhập danh sách người tham dự / CME từ file Excel',             'seminars', 'import',     60),
    ('PERM-SEM-EXPORT',     N'Xuất Excel',               N'Xuất danh sách, sổ CME, thống kê hội thảo/hội nghị',           'seminars', 'export',     70),
    ('PERM-SEM-CME-MANAGE', N'Quản lý cấp CME',          N'Cấp / thu hồi số quyết định CME, chỉnh sổ cấp CME theo năm',   'seminars', 'cme_manage', 80)
) AS src (id, name, description, resource, action, sort_order)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, group_id, sort_order, created_at, resource, action)
    VALUES (src.id, src.name, src.description, @grp, src.sort_order, GETDATE(), src.resource, src.action)
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description, group_id = @grp,
               sort_order = src.sort_order, resource = src.resource, action = src.action;
GO

------------------------------------------------------------------------------
-- 7. Gán quyền mặc định cho vai trò
--    VT01 admin  : tất cả
--    VT02 lãnh đạo: read + export
--    VT03 NCKH    : read/create/update/import/export/cme_manage
------------------------------------------------------------------------------
MERGE dbo.role_permissions AS tgt
USING (VALUES
    ('VT01','PERM-SEM-READ'),('VT01','PERM-SEM-CREATE'),('VT01','PERM-SEM-UPDATE'),
    ('VT01','PERM-SEM-DELETE'),('VT01','PERM-SEM-MANAGE'),('VT01','PERM-SEM-IMPORT'),
    ('VT01','PERM-SEM-EXPORT'),('VT01','PERM-SEM-CME-MANAGE'),
    ('VT02','PERM-SEM-READ'),('VT02','PERM-SEM-EXPORT'),
    ('VT03','PERM-SEM-READ'),('VT03','PERM-SEM-CREATE'),('VT03','PERM-SEM-UPDATE'),
    ('VT03','PERM-SEM-IMPORT'),('VT03','PERM-SEM-EXPORT'),('VT03','PERM-SEM-CME-MANAGE')
) AS src (role_id, permission_id)
ON tgt.role_id = src.role_id AND tgt.permission_id = src.permission_id
WHEN NOT MATCHED BY TARGET
     AND EXISTS (SELECT 1 FROM dbo.roles r WHERE r.id = src.role_id) THEN
    INSERT (role_id, permission_id, created_at, created_by)
    VALUES (src.role_id, src.permission_id, GETDATE(), N'SYSTEM');
GO

PRINT N'✅ Migration 2026-09-03_seminars hoàn tất.';
GO
