/* ============================================================================
 * 2026-09-30_gop_thang_09 — gộp 47 migration 2026-09-03 → 2026-09-30
 * ----------------------------------------------------------------------------
 *   Nội dung NGUYÊN VĂN các file cũ, đúng thứ tự cũ. Mỗi phần mở đầu bằng dòng
 *   "-- @migration <tên file cũ>". Runner chỉ chạy phần DB chưa ghi nhận; DB đã
 *   chạy đủ các file cũ thì chỉ ghi nhận file này, không chạy lại gì.
 *   Không sửa phần cũ — cần đổi gì thì viết migration mới (database/README.md).
 * ==========================================================================*/

-- @migration 2026-09-03_seminars.sql
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

-- @migration 2026-09-04_deadline_type_topic_registration.sql
/* ============================================================================
 * Bổ sung loại mốc thời gian "Đăng ký đề tài" (topic_registration)
 * ----------------------------------------------------------------------------
 *   topic_registration — "Đăng ký đề tài": khoảng thời gian mở đăng ký đề tài
 *
 * - Mở rộng CHECK constraint CHK_rd_type để chấp nhận 'topic_registration'.
 * Script idempotent, chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL]
GO

------------------------------------------------------------------------------
-- 1. Gỡ CHECK cũ
------------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_rd_type')
    ALTER TABLE dbo.round_deadlines DROP CONSTRAINT CHK_rd_type;
GO

------------------------------------------------------------------------------
-- 2. CHECK constraint mới (thêm 'topic_registration')
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_rd_type')
BEGIN
    ALTER TABLE dbo.round_deadlines WITH CHECK
        ADD CONSTRAINT CHK_rd_type CHECK
        (deadline_type IN
            ('topic_registration', 'edit', 'supplement', 'report_submission'));
END
GO

-- @migration 2026-09-04_round_type_levels.sql
/* ============================================================================
 * Cấp độ đề tài "ăn theo" loại đợt (round_type_levels)
 * ----------------------------------------------------------------------------
 * - Bảng nối round_types (RTxx) ↔ levels (CDxx): mỗi loại đợt được phép những
 *   cấp độ nào. Form đăng ký đề tài chỉ hiển thị cấp độ thuộc loại đợt đó.
 * - Loại đợt CHƯA cấu hình cấp độ nào ⇒ coi như cho phép tất cả (fallback).
 * Script idempotent, chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL]
GO

IF OBJECT_ID(N'dbo.round_type_levels', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.round_type_levels (
        round_type_id VARCHAR(6)   NOT NULL,
        level_id      VARCHAR(5)   NOT NULL,
        created_at    DATETIME2(7) NOT NULL
            CONSTRAINT DF_rtl_created_at DEFAULT GETDATE(),
        CONSTRAINT PK_round_type_levels PRIMARY KEY (round_type_id, level_id),
        CONSTRAINT FK_rtl_round_type FOREIGN KEY (round_type_id)
            REFERENCES dbo.round_types (id) ON DELETE CASCADE,
        CONSTRAINT FK_rtl_level FOREIGN KEY (level_id)
            REFERENCES dbo.levels (id) ON DELETE CASCADE
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_rtl_level')
BEGIN
    CREATE NONCLUSTERED INDEX idx_rtl_level
        ON dbo.round_type_levels (level_id);
END
GO

-- @migration 2026-09-04_seminar_manual_counts.sql
/* ============================================================================
 * seminars: thêm SỐ LIỆU TỔNG HỢP nhập tay
 * ----------------------------------------------------------------------------
 * Cho phép ghi nhanh 1 hội thảo mà KHÔNG cần nhập từng người:
 *   - manual_participant_count : tổng số người tham dự
 *   - manual_internal_count / manual_external_count / manual_foreign_count
 *     : phân rã trong viện / ngoại viện / nước ngoài (tùy chọn, cho mẫu file 1.4)
 *   - manual_cme_count : số lượng chứng chỉ CME đã cấp
 *
 * Danh sách người tham dự chi tiết (bảng seminar_participants) vẫn dùng được
 * cho những hội nghị cần cấp CME theo tên + số quyết định. Khi có số nhập tay,
 * giao diện ưu tiên hiển thị số nhập tay.
 *
 * Script idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.seminars', N'manual_participant_count') IS NULL
    ALTER TABLE dbo.seminars ADD manual_participant_count INT NULL;
GO
IF COL_LENGTH(N'dbo.seminars', N'manual_internal_count') IS NULL
    ALTER TABLE dbo.seminars ADD manual_internal_count INT NULL;
GO
IF COL_LENGTH(N'dbo.seminars', N'manual_external_count') IS NULL
    ALTER TABLE dbo.seminars ADD manual_external_count INT NULL;
GO
IF COL_LENGTH(N'dbo.seminars', N'manual_foreign_count') IS NULL
    ALTER TABLE dbo.seminars ADD manual_foreign_count INT NULL;
GO
IF COL_LENGTH(N'dbo.seminars', N'manual_cme_count') IS NULL
    ALTER TABLE dbo.seminars ADD manual_cme_count INT NULL;
GO

PRINT N'✅ Migration 2026-09-04_seminar_manual_counts hoàn tất.';
GO

-- @migration 2026-09-04_split_notif_catalog_perms.sql
/* ============================================================================
 * Tách quyền "thô" của Thông báo & Danh mục thành quyền theo thao tác
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Trước đây resource 'notifications' và 'catalog' mỗi cái chỉ có đúng 1 quyền
 *   ('*:manage'), nên trong màn "Vai trò & Quyền" hai dòng này chỉ hiện 1 ô —
 *   không thể cấp quyền chi tiết (chỉ xem, chỉ gửi...). Migration này bổ sung:
 *     notifications : read  (xem danh sách đã gửi + người nhận)
 *                     create (gửi thông báo)
 *                     delete (thu hồi / xoá thông báo)
 *     catalog       : read  (mở màn quản lý phân loại / cấp độ / loại đợt)
 *                     create / update / delete (thao tác trên các mục danh mục)
 *   Quyền '*:manage' cũ được GIỮ LẠI làm quyền bao (authorizePermission luôn cho
 *   '<resource>:manage' đi qua), nên các vai trò đang có 'notifications:manage'
 *   / 'catalog:manage' (VT01, VT03) KHÔNG mất quyền nào.
 *
 *   Backend đã đổi guard các route tương ứng sang quyền chi tiết
 *   (server/src/routes/notifications.js, server/src/routes/lookups.js);
 *   GET /categories, /levels, /round-types vẫn mở cho mọi tài khoản đăng nhập
 *   vì form đăng ký đề tài cần đổ dropdown.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Thêm quyền chi tiết cho 'notifications' và 'catalog'
------------------------------------------------------------------------------
MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-NOTIF-READ',   N'Xem thông báo đã gửi', N'Xem danh sách thông báo hệ thống đã gửi và người nhận',     'notifications', 'read',   10),
    ('PERM-NOTIF-CREATE', N'Gửi thông báo',        N'Soạn và gửi thông báo tới người dùng / toàn hệ thống',       'notifications', 'create', 20),
    ('PERM-NOTIF-DELETE', N'Xoá thông báo',        N'Thu hồi / xoá thông báo đã gửi',                             'notifications', 'delete', 40),
    ('PERM-CAT-READ',     N'Xem danh mục',         N'Mở màn hình quản lý phân loại, cấp độ, loại đợt nghiên cứu', 'catalog',       'read',   10),
    ('PERM-CAT-CREATE',   N'Thêm mục danh mục',    N'Tạo phân loại / cấp độ / loại đợt nghiên cứu',               'catalog',       'create', 20),
    ('PERM-CAT-UPDATE',   N'Sửa mục danh mục',     N'Cập nhật phân loại / cấp độ / loại đợt nghiên cứu',          'catalog',       'update', 30),
    ('PERM-CAT-DELETE',   N'Xoá mục danh mục',     N'Xoá phân loại / cấp độ / loại đợt nghiên cứu',               'catalog',       'delete', 40)
) AS src (id, name, description, resource, action, sort_order)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, sort_order, created_at, created_by, resource, action)
    VALUES (src.id, src.name, src.description, src.sort_order, GETDATE(), N'SYSTEM', src.resource, src.action)
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description,
               sort_order = src.sort_order, resource = src.resource, action = src.action;
GO

------------------------------------------------------------------------------
-- 2. Cấp quyền mới cho VT01 (admin) để ma trận phân quyền hiển thị đủ tích.
--    VT03 đã có '*:manage' nên không cần cấp thêm (vẫn đủ quyền thao tác).
------------------------------------------------------------------------------
MERGE [dbo].[role_permissions] AS tgt
USING (VALUES
    ('VT01','PERM-NOTIF-READ'),('VT01','PERM-NOTIF-CREATE'),('VT01','PERM-NOTIF-DELETE'),
    ('VT01','PERM-CAT-READ'),('VT01','PERM-CAT-CREATE'),('VT01','PERM-CAT-UPDATE'),('VT01','PERM-CAT-DELETE')
) AS src (role_id, permission_id)
ON tgt.role_id = src.role_id AND tgt.permission_id = src.permission_id
WHEN NOT MATCHED BY TARGET
     AND EXISTS (SELECT 1 FROM [dbo].[roles] r WHERE r.id = src.role_id)
     AND EXISTS (SELECT 1 FROM [dbo].[permissions] p WHERE p.id = src.permission_id) THEN
    INSERT (role_id, permission_id, created_by)
    VALUES (src.role_id, src.permission_id, N'SYSTEM');
GO

PRINT N'✅ Migration 2026-09-04_split_notif_catalog_perms hoàn tất.';
GO

-- @migration 2026-09-11_job_execution_log.sql
/* ============================================================================
 * Bảng chống gửi trùng cho cron job nền (nhắc deadline, bảo trì tài khoản)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Hệ thống chưa có cron job nào (deadlineGuard chỉ kiểm tra PHẢN ỨNG khi
 *   người dùng thao tác, không có job CHỦ ĐỘNG nhắc trước deadline như bản
 *   PHP nguồn — cron_nckh_nhac_viec.php). Thêm job nền cần một cách đảm bảo
 *   "gửi đúng 1 lần" cho mỗi (job, khoá) — bảng này dùng UNIQUE constraint để
 *   INSERT lần 2 tự thất bại thay vì phải SELECT-rồi-INSERT (tránh race
 *   condition nếu job chạy trùng giờ do server restart).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.job_execution_log', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[job_execution_log] (
        [id]         BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [job_name]   VARCHAR(50)  NOT NULL,
        [dedupe_key] VARCHAR(150) NOT NULL,
        [run_at]     DATETIME     NOT NULL CONSTRAINT DF_job_execution_log_run_at DEFAULT (GETDATE()),
        CONSTRAINT UQ_job_execution_log_job_key UNIQUE ([job_name], [dedupe_key])
    );
END
GO

PRINT N'✅ Migration 2026-09-11_job_execution_log hoàn tất.';
GO

-- @migration 2026-09-11_security_hardening.sql
/* ============================================================================
 * Nâng cấp bảo mật: khoá tài khoản sau nhiều lần đăng nhập sai, theo dõi
 * phiên đăng nhập (refresh token) theo IP/thiết bị, và nhật ký sự kiện bảo mật
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   - Đăng nhập hiện chỉ có rate-limit theo IP (10 lần/15 phút, routes/auth.js),
 *     chưa khoá theo TÀI KHOẢN — dò mật khẩu rải qua nhiều IP vẫn lọt.
 *   - Refresh token hiện không rotate: 1 token sống nguyên tới khi hết hạn
 *     (mặc định 7 ngày) hoặc người dùng bấm logout — lộ token là lộ 7 ngày.
 *     Cũng không lưu IP/thiết bị nên không thể liệt kê/thu hồi theo phiên.
 *   - Audit log request chung đã CHỦ ĐỘNG chuyển ra file (xem
 *     middlewares/activityLogger.js) để không tải DB — KHÔNG revert lại đây.
 *     security_events là bảng MỚI, RIÊNG, chỉ ghi sự kiện bảo mật rời rạc,
 *     tần suất thấp, cần truy vấn/join được (khoá tài khoản, xoay refresh
 *     token, xem dữ liệu nhạy cảm ở các module sau này như CCCD học viên).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Chống dò mật khẩu theo tài khoản
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.users', N'failed_login_count') IS NULL
    ALTER TABLE [dbo].[users]
        ADD [failed_login_count] INT NOT NULL CONSTRAINT DF_users_failed_login_count DEFAULT (0);
GO
IF COL_LENGTH(N'dbo.users', N'locked_until') IS NULL
    ALTER TABLE [dbo].[users] ADD [locked_until] DATETIME NULL;
GO

------------------------------------------------------------------------------
-- 2. Theo dõi phiên đăng nhập trên refresh_tokens (phục vụ liệt kê phiên +
--    "đăng xuất khỏi mọi thiết bị").
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.refresh_tokens', N'ip_address') IS NULL
    ALTER TABLE [dbo].[refresh_tokens] ADD [ip_address] VARCHAR(64) NULL;
GO
IF COL_LENGTH(N'dbo.refresh_tokens', N'user_agent') IS NULL
    ALTER TABLE [dbo].[refresh_tokens] ADD [user_agent] NVARCHAR(255) NULL;
GO

------------------------------------------------------------------------------
-- 3. Nhật ký sự kiện bảo mật (bảng mới, không liên quan audit log file)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.security_events', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[security_events] (
        [id]          BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [event_type]  VARCHAR(50)    NOT NULL,
        [actor_id]    VARCHAR(20)    NULL,
        [target_type] VARCHAR(50)    NULL,
        [target_id]   VARCHAR(50)    NULL,
        [ip_address]  VARCHAR(64)    NULL,
        [user_agent]  NVARCHAR(255)  NULL,
        [detail]      NVARCHAR(1000) NULL,
        [created_at]  DATETIME       NOT NULL CONSTRAINT DF_security_events_created_at DEFAULT (GETDATE())
    );
    CREATE NONCLUSTERED INDEX [IX_security_events_created_at_desc] ON [dbo].[security_events] ([created_at] DESC);
    CREATE NONCLUSTERED INDEX [IX_security_events_event_type] ON [dbo].[security_events] ([event_type], [created_at] DESC);
END
GO

------------------------------------------------------------------------------
-- 4. Quyền xem nhật ký sự kiện bảo mật (mirror pattern PERM-ACTLOG-READ)
------------------------------------------------------------------------------
MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-SECEVT-READ', N'Xem nhật ký bảo mật', N'Xem lịch sử khoá tài khoản, xoay phiên đăng nhập, truy cập dữ liệu nhạy cảm', 'security_events', 'read', 95)
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
    ('VT01', 'PERM-SECEVT-READ')
) AS src (role_id, permission_id)
ON tgt.role_id = src.role_id AND tgt.permission_id = src.permission_id
WHEN NOT MATCHED BY TARGET
     AND EXISTS (SELECT 1 FROM [dbo].[roles] r WHERE r.id = src.role_id)
     AND EXISTS (SELECT 1 FROM [dbo].[permissions] p WHERE p.id = src.permission_id) THEN
    INSERT (role_id, permission_id, created_by)
    VALUES (src.role_id, src.permission_id, N'SYSTEM');
GO

PRINT N'✅ Migration 2026-09-11_security_hardening hoàn tất.';
GO

/* --------------------------------------------------------------------------
 * KIỂM TRA SAU KHI CHẠY
 *   SELECT failed_login_count, locked_until FROM users WHERE id = 'VT01_ADMIN_ID'; -- tồn tại, mặc định 0/NULL
 *   SELECT TOP 1 * FROM security_events ORDER BY id DESC;
 *   SELECT * FROM role_permissions WHERE permission_id = 'PERM-SECEVT-READ'; -- có VT01
 * ------------------------------------------------------------------------*/

-- @migration 2026-09-11_topic_budget_decision_fields.sql
/* ============================================================================
 * Bổ sung trường tài chính & số quyết định cho đề tài NCKH
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu với hệ thống NCKH của Bệnh viện Hữu nghị Đa khoa Nghệ An
 *   (QLNCKHDTCDT-main, bảng nckh_de_tai): đề tài bên đó có kinh phí dự toán/
 *   thực tế và số + ngày quyết định phê duyệt/công nhận — Hospital_RMS chưa
 *   có các trường này trên `topics`. Bổ sung để theo dõi được kinh phí và hồ
 *   sơ quyết định chính thức của đề tài.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.topics', N'budget_estimated') IS NULL
    ALTER TABLE [dbo].[topics] ADD [budget_estimated] DECIMAL(18,2) NULL;
GO
IF COL_LENGTH(N'dbo.topics', N'budget_actual') IS NULL
    ALTER TABLE [dbo].[topics] ADD [budget_actual] DECIMAL(18,2) NULL;
GO
IF COL_LENGTH(N'dbo.topics', N'approval_decision_no') IS NULL
    ALTER TABLE [dbo].[topics] ADD [approval_decision_no] NVARCHAR(100) NULL;
GO
IF COL_LENGTH(N'dbo.topics', N'approval_decision_date') IS NULL
    ALTER TABLE [dbo].[topics] ADD [approval_decision_date] DATE NULL;
GO
IF COL_LENGTH(N'dbo.topics', N'recognition_decision_no') IS NULL
    ALTER TABLE [dbo].[topics] ADD [recognition_decision_no] NVARCHAR(100) NULL;
GO
IF COL_LENGTH(N'dbo.topics', N'recognition_decision_date') IS NULL
    ALTER TABLE [dbo].[topics] ADD [recognition_decision_date] DATE NULL;
GO

PRINT N'✅ Migration 2026-09-11_topic_budget_decision_fields hoàn tất.';
GO

-- @migration 2026-09-11_training_foundation.sql
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

-- @migration 2026-09-11_training_operations.sql
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

-- @migration 2026-09-11_training_results.sql
/* ============================================================================
 * Kết quả, chứng nhận & CME cho Đào tạo (Giai đoạn 5)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   - training_files: kho file DÙNG CHUNG cho toàn domain Đào tạo (hồ sơ học
 *     viên, tài liệu/đề kiểm tra khóa học, file chứng chỉ). Bảng `files` hiện
 *     có của hệ thống bị khoá cứng vào topic_id (chỉ dùng cho NCKH) — không
 *     đụng vào bảng đó để tránh rủi ro cho luồng NCKH đang chạy tốt; Đào tạo
 *     có kho file polymorphic riêng (entity_type/entity_id).
 *   - course_documents GỘP LUÔN "tài liệu khóa học" và "bài kiểm tra" thành 1
 *     khái niệm (doc_type: material/test_question/test_answer) — đối chiếu
 *     bản PHP nguồn, "bài kiểm tra" ở đó cũng chỉ là file đề + đáp án kèm cờ
 *     công khai đáp án (cong_khai_dap_an), KHÔNG có chấm điểm trực tuyến, nên
 *     không cần model riêng phức tạp hơn.
 *   - trainee_documents: hồ sơ học viên (CCCD, bằng cấp...) — hoãn từ Giai
 *     đoạn 3, nay triển khai cùng lúc với hạ tầng file chung.
 *   - KHÔNG thêm quyền (permission) mới: course_documents/grades/certificates
 *     dùng lại quyền 'courses:*' đã có; trainee_documents dùng lại
 *     'trainees:update' + 'trainees:read_sensitive'; cme_requirements dùng
 *     lại 'seminars:cme_manage' đã có sẵn cho toàn bộ nghiệp vụ CME.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Kho file dùng chung cho Đào tạo (polymorphic qua entity_type/entity_id)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.training_files', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[training_files] (
        [id]          VARCHAR(20)   NOT NULL PRIMARY KEY,
        [entity_type] VARCHAR(30)   NOT NULL, -- 'trainee_document' | 'course_document' | 'certificate'
        [entity_id]   VARCHAR(20)   NOT NULL,
        [file_name]   NVARCHAR(255) NOT NULL,
        [file_url]    NVARCHAR(500) NOT NULL,
        [mime_type]   VARCHAR(150)  NULL,
        [file_size]   BIGINT        NULL,
        [is_deleted]  BIT           NOT NULL CONSTRAINT DF_training_files_is_deleted DEFAULT (0),
        [created_at]  DATETIME      NOT NULL CONSTRAINT DF_training_files_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20)   NULL
    );
    CREATE NONCLUSTERED INDEX [IX_training_files_entity] ON [dbo].[training_files] ([entity_type], [entity_id]);
END
GO

------------------------------------------------------------------------------
-- 2. Hồ sơ học viên (hoãn từ Giai đoạn 3)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.trainee_documents', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[trainee_documents] (
        [id]         VARCHAR(20)  NOT NULL PRIMARY KEY,
        [trainee_id] VARCHAR(20)  NOT NULL,
        [doc_type]   VARCHAR(30)  NOT NULL, -- 'national_id' | 'degree' | 'other'
        [file_id]    VARCHAR(20)  NOT NULL,
        [created_at] DATETIME     NOT NULL CONSTRAINT DF_trainee_documents_created_at DEFAULT (GETDATE()),
        [created_by] VARCHAR(20)  NULL,
        CONSTRAINT FK_trndoc_trainee FOREIGN KEY ([trainee_id]) REFERENCES [dbo].[trainees]       ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_trndoc_file    FOREIGN KEY ([file_id])    REFERENCES [dbo].[training_files] ([id])
    );
END
GO

------------------------------------------------------------------------------
-- 3. Tài liệu / bài kiểm tra khóa học (gộp 1 khái niệm — xem giải thích đầu file)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.course_documents', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[course_documents] (
        [id]        VARCHAR(20)   NOT NULL PRIMARY KEY,
        [course_id] VARCHAR(20)   NOT NULL,
        [doc_type]  VARCHAR(20)   NOT NULL CONSTRAINT DF_course_documents_doc_type DEFAULT ('material'),
        [title]     NVARCHAR(255) NOT NULL,
        [file_id]   VARCHAR(20)   NOT NULL,
        [is_public] BIT           NOT NULL CONSTRAINT DF_course_documents_is_public DEFAULT (1),
        [created_at] DATETIME     NOT NULL CONSTRAINT DF_course_documents_created_at DEFAULT (GETDATE()),
        [created_by] VARCHAR(20)  NULL,
        CONSTRAINT FK_crsdoc_course FOREIGN KEY ([course_id]) REFERENCES [dbo].[courses]        ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_crsdoc_file   FOREIGN KEY ([file_id])   REFERENCES [dbo].[training_files] ([id])
    );
END
GO

------------------------------------------------------------------------------
-- 4. Kết quả học tập
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.grades', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[grades] (
        [id]            VARCHAR(20)   NOT NULL PRIMARY KEY,
        [enrollment_id] VARCHAR(20)   NOT NULL,
        [subject_id]    VARCHAR(20)   NULL, -- NULL = điểm/kết quả tổng kết khóa học
        [score]         DECIMAL(5,2)  NULL,
        [result]        VARCHAR(20)   NULL, -- 'pass' | 'fail' | tự do
        [note]          NVARCHAR(255) NULL,
        [created_at]    DATETIME      NOT NULL CONSTRAINT DF_grades_created_at DEFAULT (GETDATE()),
        [created_by]    VARCHAR(20)   NULL,
        [updated_at]    DATETIME      NULL,
        [updated_by]    VARCHAR(20)   NULL,
        CONSTRAINT FK_grades_enrollment FOREIGN KEY ([enrollment_id]) REFERENCES [dbo].[course_enrollments] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_grades_subject    FOREIGN KEY ([subject_id])    REFERENCES [dbo].[subjects]           ([id])
    );
END
GO

------------------------------------------------------------------------------
-- 5. Chứng chỉ — 1 chứng chỉ / lượt đăng ký, số chứng chỉ duy nhất
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.certificates', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[certificates] (
        [id]            VARCHAR(20)  NOT NULL PRIMARY KEY,
        [enrollment_id] VARCHAR(20)  NOT NULL,
        [cert_no]       VARCHAR(30)  NOT NULL,
        [issue_date]    DATE         NOT NULL CONSTRAINT DF_certificates_issue_date DEFAULT (CAST(GETDATE() AS DATE)),
        [file_id]       VARCHAR(20)  NULL,
        [created_at]    DATETIME     NOT NULL CONSTRAINT DF_certificates_created_at DEFAULT (GETDATE()),
        [created_by]    VARCHAR(20)  NULL,
        CONSTRAINT FK_cert_enrollment FOREIGN KEY ([enrollment_id]) REFERENCES [dbo].[course_enrollments] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_cert_file       FOREIGN KEY ([file_id])       REFERENCES [dbo].[training_files]     ([id]),
        CONSTRAINT UQ_cert_enrollment UNIQUE ([enrollment_id]),
        CONSTRAINT UQ_cert_no UNIQUE ([cert_no])
    );
END
GO

------------------------------------------------------------------------------
-- 6. Ngưỡng tín chỉ CME theo năm (toàn viện hoặc theo khoa/phòng)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.cme_requirements', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[cme_requirements] (
        [id]                VARCHAR(20)  NOT NULL PRIMARY KEY,
        [year]              INT          NOT NULL,
        [required_credits]  DECIMAL(6,2) NOT NULL,
        [department_id]     VARCHAR(20)  NULL, -- NULL = áp dụng toàn viện
        [note]              NVARCHAR(255) NULL,
        [created_at]        DATETIME     NOT NULL CONSTRAINT DF_cme_requirements_created_at DEFAULT (GETDATE()),
        [created_by]        VARCHAR(20)  NULL,
        [updated_at]        DATETIME     NULL,
        [updated_by]        VARCHAR(20)  NULL,
        CONSTRAINT FK_cmereq_department FOREIGN KEY ([department_id]) REFERENCES [dbo].[departments] ([id])
    );
END
GO

PRINT N'✅ Migration 2026-09-11_training_results hoàn tất.';
GO

-- @migration 2026-09-14_cme_credit_conversion.sql
/* ============================================================================
 * Danh mục quy đổi tín chỉ CME (Giai đoạn 6)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu file dump `ql_nckh_dt_cdt`: dt_cme_nhom (nhóm hoạt động) +
 *   dt_cme_loai (loại hoạt động, có công thức quy đổi kieu_quy_doi/gia_tri_quy_doi)
 *   cho phép hệ thống GỢI Ý số tín chỉ theo loại hoạt động thay vì nhập tay.
 *
 *   Hospital_RMS hiện có cme_credit_categories (từ 2026-09-11_training_foundation)
 *   nhưng chỉ là danh mục phẳng id/name/description — KHÔNG có công thức, và
 *   KHÔNG được dùng trong cmeRequirementService.getComplianceReport() (số tín chỉ
 *   earned_credits hiện lấy thẳng từ seminar_participants.cme_credits, nhập tay).
 *
 *   Không đổi tên / không nhân đôi bảng cme_credit_categories (đã wire sẵn ở
 *   routes/lookups.js 'cme-credit-categories' + frontend danh mục đào tạo) —
 *   MỞ RỘNG tại chỗ bằng cách thêm cột, và thêm 1 bảng nhóm mới ở trên.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Nhóm hoạt động CME (mirror dt_cme_nhom — shape giống categories/levels)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.cme_credit_groups', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[cme_credit_groups] (
        [id]          VARCHAR(20)   NOT NULL PRIMARY KEY,
        [name]        NVARCHAR(255) NOT NULL,
        [description] NVARCHAR(MAX) NULL,
        [sort_order]  INT           NOT NULL CONSTRAINT DF_cme_credit_groups_sort_order DEFAULT (0),
        [created_at]  DATETIME      NOT NULL CONSTRAINT DF_cme_credit_groups_created_at DEFAULT (GETDATE()),
        [created_by]  VARCHAR(20)   NULL,
        [updated_at]  DATETIME      NULL,
        [updated_by]  VARCHAR(20)   NULL
    );
END
GO

------------------------------------------------------------------------------
-- 2. Mở rộng cme_credit_categories với công thức quy đổi (mirror dt_cme_loai)
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.cme_credit_categories', 'group_id') IS NULL
    ALTER TABLE [dbo].[cme_credit_categories] ADD [group_id] VARCHAR(20) NULL;
GO
IF COL_LENGTH('dbo.cme_credit_categories', 'conversion_method') IS NULL
    ALTER TABLE [dbo].[cme_credit_categories] ADD [conversion_method] VARCHAR(20) NOT NULL
        CONSTRAINT DF_cme_credit_categories_conversion_method DEFAULT ('fixed');
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_cme_credit_categories_conversion_method')
    ALTER TABLE [dbo].[cme_credit_categories] ADD CONSTRAINT [CHK_cme_credit_categories_conversion_method]
        CHECK ([conversion_method] IN ('per_session','fixed','per_year'));
GO
IF COL_LENGTH('dbo.cme_credit_categories', 'conversion_value') IS NULL
    ALTER TABLE [dbo].[cme_credit_categories] ADD [conversion_value] DECIMAL(6,2) NULL;
GO
IF COL_LENGTH('dbo.cme_credit_categories', 'unit_label') IS NULL
    ALTER TABLE [dbo].[cme_credit_categories] ADD [unit_label] NVARCHAR(40) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_cmecat_group')
    ALTER TABLE [dbo].[cme_credit_categories] ADD CONSTRAINT [FK_cmecat_group]
        FOREIGN KEY ([group_id]) REFERENCES [dbo].[cme_credit_groups] ([id]);
GO

------------------------------------------------------------------------------
-- 3. Quyền — dùng lại 'training_catalog' đã có (cme_credit_categories vốn đã
--    thuộc nhóm quyền này); chỉ cần route mới cho cme_credit_groups, không cần
--    permission mới.
------------------------------------------------------------------------------

PRINT N'✅ Migration 2026-09-14_cme_credit_conversion hoàn tất.';
GO

-- @migration 2026-09-14_department_enrichment.sql
/* ============================================================================
 * Mở rộng departments (Giai đoạn 6)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   dm_khoa_phong (file dump ql_nckh_dt_cdt) có loai_don_vi (Khoa/Phòng/Trung tâm),
 *   truong_khoa_id (trưởng khoa), dien_thoai, email, so_giuong — departments hiện
 *   tại chưa có. Toàn bộ cột thêm đều NULL-able/có default, không phá dữ liệu
 *   hay API hiện có (chỉ thêm field optional).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.departments', 'unit_type') IS NULL
    ALTER TABLE [dbo].[departments] ADD [unit_type] VARCHAR(20) NOT NULL
        CONSTRAINT DF_departments_unit_type DEFAULT ('khoa');
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_departments_unit_type')
    ALTER TABLE [dbo].[departments] ADD CONSTRAINT [CHK_departments_unit_type]
        CHECK ([unit_type] IN ('khoa','phong','trung_tam'));
GO
IF COL_LENGTH('dbo.departments', 'head_user_id') IS NULL
    ALTER TABLE [dbo].[departments] ADD [head_user_id] VARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_departments_head_user')
    ALTER TABLE [dbo].[departments] ADD CONSTRAINT [FK_departments_head_user]
        FOREIGN KEY ([head_user_id]) REFERENCES [dbo].[users] ([id]);
GO
IF COL_LENGTH('dbo.departments', 'phone') IS NULL
    ALTER TABLE [dbo].[departments] ADD [phone] VARCHAR(20) NULL;
GO
IF COL_LENGTH('dbo.departments', 'email') IS NULL
    ALTER TABLE [dbo].[departments] ADD [email] VARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.departments', 'bed_count') IS NULL
    ALTER TABLE [dbo].[departments] ADD [bed_count] INT NULL;
GO

PRINT N'✅ Migration 2026-09-14_department_enrichment hoàn tất.';
GO

-- @migration 2026-09-14_seed_trainee_types.sql
/* ============================================================================
 * Seed danh mục "Đối tượng học viên" (trainee_types) — hiện đang RỖNG trong DB
 * (user chụp màn hình dropdown "Đối tượng học viên" cho thấy 7 mục tham chiếu
 * từ dm_doi_tuong_hoc_vien của file dump ql_nckh_dt_cdt cũ).
 *
 * Script idempotent — chạy lại nhiều lần an toàn (MERGE theo id cố định).
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

MERGE [dbo].[trainee_types] AS tgt
USING (VALUES
    ('TRNTYPE-BS',  N'Bác sĩ',                 N'Bác sĩ điều trị'),
    ('TRNTYPE-DD',  N'Điều dưỡng',             N'Điều dưỡng các khoa lâm sàng'),
    ('TRNTYPE-KTV', N'Kỹ thuật viên',          N'KTV xét nghiệm, CĐHA, vật lý trị liệu...'),
    ('TRNTYPE-NHS', N'Nữ hộ sinh',             N'Nữ hộ sinh sản phụ khoa'),
    ('TRNTYPE-DSI', N'Dược sĩ',                N'Dược sĩ lâm sàng / nhà thuốc'),
    ('TRNTYPE-QL',  N'Cán bộ quản lý y tế',    N'Lãnh đạo bệnh viện, trưởng khoa/phòng'),
    ('TRNTYPE-SV',  N'Sinh viên y khoa',       N'Sinh viên các trường ĐH Y')
) AS src (id, name, description)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, created_by)
    VALUES (src.id, src.name, src.description, N'SYSTEM')
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description;
GO

PRINT N'✅ Migration 2026-09-14_seed_trainee_types hoàn tất.';
GO

-- @migration 2026-09-14_seed_training_forms.sql
/* ============================================================================
 * Seed danh mục "Hình thức học" (training_forms) — hiện đang RỖNG trong DB.
 *
 * Script idempotent — chạy lại nhiều lần an toàn (MERGE theo id cố định).
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

MERGE [dbo].[training_forms] AS tgt
USING (VALUES
    ('TRNFORM-TT',  N'Trực tiếp tại lớp',     N'Học trực tiếp tại lớp học'),
    ('TRNFORM-OL',  N'Trực tuyến (Online)',   N'Học trực tuyến qua nền tảng E-learning/video call'),
    ('TRNFORM-HB',  N'Kết hợp (Hybrid)',      N'Kết hợp trực tiếp và trực tuyến'),
    ('TRNFORM-ELS', N'E-learning tự học',     N'Tự học qua tài liệu/video, không có lớp cố định'),
    ('TRNFORM-LS',  N'Đi lâm sàng',           N'Thực hành lâm sàng tại khoa/phòng')
) AS src (id, name, description)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, created_by)
    VALUES (src.id, src.name, src.description, N'SYSTEM')
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description;
GO

PRINT N'✅ Migration 2026-09-14_seed_training_forms hoàn tất.';
GO

-- @migration 2026-09-14_seed_training_types.sql
/* ============================================================================
 * Seed danh mục "Loại hình đào tạo" (training_types) — hiện đang RỖNG trong DB.
 *
 * Script idempotent — chạy lại nhiều lần an toàn (MERGE theo id cố định).
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

MERGE [dbo].[training_types] AS tgt
USING (VALUES
    ('TRNTP-CME', N'Đào tạo y khoa liên tục (CME)', N'Continuing Medical Education'),
    ('TRNTP-TOT', N'Đào tạo giảng viên (TOT)',      N'Training of Trainers'),
    ('TRNTP-CDT', N'Chỉ đạo tuyến',                 N'Đào tạo, hỗ trợ tuyến dưới'),
    ('TRNTP-CS',  N'Đào tạo chuyên sâu',            N'Chuyên khoa, kỹ thuật chuyên sâu'),
    ('TRNTP-NH',  N'Đào tạo ngắn hạn',              N'Khoá học ngắn ngày'),
    ('TRNTP-GPHN', N'Giấy phép hành nghề',          N'Đào tạo phục vụ cấp/gia hạn giấy phép hành nghề')
) AS src (id, name, description)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, created_by)
    VALUES (src.id, src.name, src.description, N'SYSTEM')
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description;
GO

PRINT N'✅ Migration 2026-09-14_seed_training_types hoàn tất.';
GO

-- @migration 2026-09-14_staff_practice_licenses.sql
/* ============================================================================
 * Chứng chỉ hành nghề (CCHN) & hồ sơ chuyên môn nhân sự (Giai đoạn 6)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu file dump hệ thống PHP nguồn `ql_nckh_dt_cdt`: bảng `dm_nhan_vien`
 *   có nhóm cột hành nghề (so_cchn, ngay_cap_cchn, pham_vi_hanh_nghe, chuyen_khoa,
 *   chuyen_khoa_cap_nhat) mà Hospital_RMS CHƯA có ở đâu — bảng users hiện tại
 *   chỉ phục vụ đăng nhập/phân quyền, không lưu hồ sơ hành nghề.
 *
 *   `chuyen_khoa_cap_nhat` (chuyên khoa cần cập nhật KTYK liên tục) chính là
 *   căn cứ nghiệp vụ để biết một nhân sự thuộc diện phải tích luỹ CME — hiện
 *   cmeRequirementService.getComplianceReport() chỉ so ngưỡng theo khoa/phòng,
 *   không biết nhân sự có thuộc diện bắt buộc CCHN hay không.
 *
 *   1 user = 1 hồ sơ CCHN hiện hành (không làm bảng lịch sử — theo đúng convention
 *   các bảng hồ sơ khác trong dự án như lecturers/trainees: cập nhật tại chỗ).
 *
 *   Đồng thời bổ sung các cột từ dm_giang_vien/dm_hoc_vien mà lecturers/trainees
 *   hiện tại chưa có, để không mất dữ liệu khi nhập từ file cũ.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Hồ sơ chứng chỉ hành nghề — gắn users.id, 1 user 1 hồ sơ hiện hành
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.staff_practice_licenses', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[staff_practice_licenses] (
        [id]                VARCHAR(20)   NOT NULL PRIMARY KEY,
        [user_id]           VARCHAR(20)   NOT NULL,
        [license_no]        VARCHAR(50)   NULL,
        [issued_date]       DATE          NULL,
        [issuing_authority] NVARCHAR(255) NULL,
        [practice_scope]    NVARCHAR(500) NULL,
        [primary_specialty] NVARCHAR(255) NULL,
        [cme_specialty]     NVARCHAR(300) NULL,
        [qualification]     NVARCHAR(150) NULL,
        [title]             NVARCHAR(150) NULL,
        [notes]             NVARCHAR(500) NULL,
        [created_at]        DATETIME      NOT NULL CONSTRAINT DF_staff_licenses_created_at DEFAULT (GETDATE()),
        [created_by]        VARCHAR(20)   NULL,
        [updated_at]        DATETIME      NULL,
        [updated_by]        VARCHAR(20)   NULL,
        CONSTRAINT FK_stafflic_user FOREIGN KEY ([user_id]) REFERENCES [dbo].[users] ([id]) ON DELETE CASCADE,
        CONSTRAINT UQ_stafflic_user UNIQUE ([user_id])
    );
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_stafflic_license_no] ON [dbo].[staff_practice_licenses] ([license_no])
        WHERE [license_no] IS NOT NULL;
END
GO

------------------------------------------------------------------------------
-- 2. Bổ sung cột còn thiếu cho lecturers (mirror dm_giang_vien: hoc_vi/hoc_ham/
--    ngay_sinh/gioi_tinh/avatar) — để nhập dữ liệu cũ không mất thông tin.
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.lecturers', 'academic_degree') IS NULL
    ALTER TABLE [dbo].[lecturers] ADD [academic_degree] NVARCHAR(50) NULL; -- hoc_vi (BS CKII, ThS, TS...)
GO
IF COL_LENGTH('dbo.lecturers', 'academic_rank') IS NULL
    ALTER TABLE [dbo].[lecturers] ADD [academic_rank] NVARCHAR(50) NULL; -- hoc_ham (GS, PGS)
GO
IF COL_LENGTH('dbo.lecturers', 'dob') IS NULL
    ALTER TABLE [dbo].[lecturers] ADD [dob] DATE NULL;
GO
IF COL_LENGTH('dbo.lecturers', 'gender') IS NULL
    ALTER TABLE [dbo].[lecturers] ADD [gender] VARCHAR(10) NULL;
GO
IF COL_LENGTH('dbo.lecturers', 'avatar_url') IS NULL
    ALTER TABLE [dbo].[lecturers] ADD [avatar_url] NVARCHAR(500) NULL;
GO

------------------------------------------------------------------------------
-- 3. Bổ sung cột còn thiếu cho trainees (mirror dm_hoc_vien: CCCD ngày/nơi cấp,
--    trường đào tạo, năm tốt nghiệp, chức vụ, avatar).
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.trainees', 'national_id_issued_date') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [national_id_issued_date] DATE NULL; -- cccd_ngay_cap
GO
IF COL_LENGTH('dbo.trainees', 'national_id_issued_place') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [national_id_issued_place] NVARCHAR(200) NULL; -- cccd_noi_cap
GO
IF COL_LENGTH('dbo.trainees', 'graduated_school') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [graduated_school] NVARCHAR(200) NULL; -- truong_dao_tao
GO
IF COL_LENGTH('dbo.trainees', 'graduated_year') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [graduated_year] SMALLINT NULL; -- nam_tot_nghiep
GO
IF COL_LENGTH('dbo.trainees', 'workplace') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [workplace] NVARCHAR(200) NULL; -- don_vi_cong_tac (học viên ngoài viện)
GO
IF COL_LENGTH('dbo.trainees', 'position') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [position] NVARCHAR(100) NULL; -- chuc_vu
GO
IF COL_LENGTH('dbo.trainees', 'avatar_url') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [avatar_url] NVARCHAR(500) NULL;
GO

------------------------------------------------------------------------------
-- 4. Quyền mới — resource 'staff_licenses' (mirror pattern PERM-TRN-*)
------------------------------------------------------------------------------
MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-LIC-READ',   N'Xem CCHN',        N'Xem hồ sơ chứng chỉ hành nghề nhân sự',      'staff_licenses', 'read',   10),
    ('PERM-LIC-CREATE', N'Thêm CCHN',       N'Tạo hồ sơ chứng chỉ hành nghề mới',          'staff_licenses', 'create', 20),
    ('PERM-LIC-UPDATE', N'Sửa CCHN',        N'Cập nhật hồ sơ chứng chỉ hành nghề',         'staff_licenses', 'update', 30),
    ('PERM-LIC-DELETE', N'Xoá CCHN',        N'Xoá hồ sơ chứng chỉ hành nghề',              'staff_licenses', 'delete', 40),
    ('PERM-LIC-MANAGE', N'Toàn quyền CCHN', N'Toàn quyền quản lý chứng chỉ hành nghề',     'staff_licenses', 'manage', 50)
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
    ('VT01','PERM-LIC-READ'),('VT01','PERM-LIC-CREATE'),('VT01','PERM-LIC-UPDATE'),('VT01','PERM-LIC-DELETE'),('VT01','PERM-LIC-MANAGE'),
    ('VT03','PERM-LIC-READ'),('VT03','PERM-LIC-CREATE'),('VT03','PERM-LIC-UPDATE'),('VT03','PERM-LIC-DELETE'),('VT03','PERM-LIC-MANAGE')
) AS src (role_id, permission_id)
ON tgt.role_id = src.role_id AND tgt.permission_id = src.permission_id
WHEN NOT MATCHED BY TARGET
     AND EXISTS (SELECT 1 FROM [dbo].[roles] r WHERE r.id = src.role_id)
     AND EXISTS (SELECT 1 FROM [dbo].[permissions] p WHERE p.id = src.permission_id) THEN
    INSERT (role_id, permission_id, created_by)
    VALUES (src.role_id, src.permission_id, N'SYSTEM');
GO

PRINT N'✅ Migration 2026-09-14_staff_practice_licenses hoàn tất.';
GO

-- @migration 2026-09-14_system_settings.sql
/* ============================================================================
 * Cấu hình hệ thống qua UI (Giai đoạn 6)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Mirror dm_cau_hinh (key-value) từ file dump ql_nckh_dt_cdt. Hospital_RMS
 *   hiện đọc toàn bộ config nghiệp vụ (ngưỡng CME, SMTP, URL public cho email)
 *   từ .env — mailService.js chỉ đọc process.env. Bảng này cho phép admin sửa
 *   các giá trị hay đổi qua màn hình cài đặt thay vì sửa .env + restart server.
 *
 *   .env vẫn là fallback nếu bảng rỗng (không phá môi trường dev/test chưa
 *   migrate/chưa seed).
 *
 *   BẢO MẬT: SMTP_PASS lưu dạng text (đúng như dm_cau_hinh bản gốc) — API đọc
 *   PHẢI che giá trị khi trả về (không bao giờ trả plaintext qua GET), chỉ ghi
 *   đè khi admin nhập giá trị mới. Quyền xem/sửa giới hạn ở MANAGE, không có
 *   READ rộng như các danh mục khác.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.system_settings', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[system_settings] (
        [setting_key] VARCHAR(50)   NOT NULL PRIMARY KEY,
        [value]       NVARCHAR(MAX) NULL,
        [description] NVARCHAR(255) NULL,
        [updated_at]  DATETIME      NOT NULL CONSTRAINT DF_system_settings_updated_at DEFAULT (GETDATE()),
        [updated_by]  VARCHAR(20)   NULL
    );
END
GO

------------------------------------------------------------------------------
-- Seed các key tương đương dm_cau_hinh bản gốc — value NULL nghĩa là "chưa cấu
-- hình, dùng .env" (mailService.js/cmeRequirementService.js sẽ fallback).
------------------------------------------------------------------------------
MERGE [dbo].[system_settings] AS tgt
USING (VALUES
    ('CME_CYCLE_YEARS', NULL, N'CME: số năm 1 chu kỳ tính ngưỡng'),
    ('CME_MIN_HOURS',   NULL, N'CME: số giờ tín chỉ tối thiểu mỗi chu kỳ'),
    ('MAIL_ENABLED',    NULL, N'1 = Bật gửi mail, 0 = Tắt (chỉ log). Để trống = dùng .env'),
    ('PUBLIC_BASE_URL', NULL, N'URL gốc cho link tra cứu trong email'),
    ('SMTP_FROM_NAME',  NULL, N'Tên người gửi'),
    ('SMTP_HOST',       NULL, N'SMTP server (vd: smtp.gmail.com)'),
    ('SMTP_PORT',       NULL, N'SMTP port (587 = TLS, 465 = SSL)'),
    ('SMTP_SECURE',     NULL, N'tls hoặc ssl'),
    ('SMTP_USER',       NULL, N'Email gửi'),
    ('SMTP_PASS',       NULL, N'App password — luôn bị che khi đọc qua API')
) AS src (setting_key, value, description)
ON tgt.setting_key = src.setting_key
WHEN NOT MATCHED BY TARGET THEN
    INSERT (setting_key, value, description, updated_by)
    VALUES (src.setting_key, src.value, src.description, N'SYSTEM');
GO

------------------------------------------------------------------------------
-- Quyền mới — resource 'system_settings', chỉ MANAGE (không tách read/create/
-- update/delete vì đây là 1 bảng key-value đơn, không phải danh mục CRUD).
------------------------------------------------------------------------------
MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-SETTINGS-MANAGE', N'Quản lý cấu hình hệ thống', N'Xem và sửa cấu hình hệ thống (SMTP, ngưỡng CME, URL public)', 'system_settings', 'manage', 10)
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
    ('VT01','PERM-SETTINGS-MANAGE')
) AS src (role_id, permission_id)
ON tgt.role_id = src.role_id AND tgt.permission_id = src.permission_id
WHEN NOT MATCHED BY TARGET
     AND EXISTS (SELECT 1 FROM [dbo].[roles] r WHERE r.id = src.role_id)
     AND EXISTS (SELECT 1 FROM [dbo].[permissions] p WHERE p.id = src.permission_id) THEN
    INSERT (role_id, permission_id, created_by)
    VALUES (src.role_id, src.permission_id, N'SYSTEM');
GO

PRINT N'✅ Migration 2026-09-14_system_settings hoàn tất.';
GO

-- @migration 2026-09-14_trainee_status_notes.sql
/* ============================================================================
 * Bổ sung trainees: trạng thái, trình độ chuyên môn, ghi chú
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu form "Thêm/Sửa học viên" của hệ thống cũ (dm_hoc_vien) với form
 *   hiện tại: còn thiếu 3 trường — trang_thai (Hoạt động/Ngừng), trinh_do_chuyen_mon
 *   (Trình độ chuyên môn, vd "Cử nhân điều dưỡng"), ghi_chu (Ghi chú tự do).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.trainees', 'is_active') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [is_active] BIT NOT NULL
        CONSTRAINT DF_trainees_is_active DEFAULT (1);
GO
IF COL_LENGTH('dbo.trainees', 'qualification') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [qualification] NVARCHAR(150) NULL; -- trinh_do_chuyen_mon
GO
IF COL_LENGTH('dbo.trainees', 'notes') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [notes] NVARCHAR(MAX) NULL; -- ghi_chu
GO

PRINT N'✅ Migration 2026-09-14_trainee_status_notes hoàn tất.';
GO

-- @migration 2026-09-15_course_enrollment_window.sql
/* ============================================================================
 * Chuyển cửa sổ đăng ký khóa học từ cấp Đợt đào tạo xuống cấp Khóa học
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   training_rounds.enrollment_start/end_date (thêm ở 2026-09-11_training_
 *   operations) áp đặt DUY NHẤT MỘT cửa sổ đăng ký cho mọi khóa học trong cùng
 *   một đợt. Thực tế một đợt đào tạo có nhiều khóa học và mỗi khóa có lịch
 *   tuyển sinh riêng (khóa khai giảng tháng 3 mở đăng ký khác khóa tháng 5
 *   trong cùng đợt Quý 1) — nên cửa sổ đăng ký phải thuộc về courses, không
 *   phải training_rounds.
 *
 *   Dữ liệu cũ: nếu đợt đã có cấu hình cửa sổ đăng ký, copy xuống các khóa học
 *   thuộc đợt đó (courses chưa tự cấu hình) trước khi xoá cột ở training_rounds.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Thêm cửa sổ đăng ký vào courses
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.courses', 'enrollment_start_date') IS NULL
BEGIN
    ALTER TABLE [dbo].[courses] ADD [enrollment_start_date] DATE NULL;
END
GO

IF COL_LENGTH('dbo.courses', 'enrollment_end_date') IS NULL
BEGIN
    ALTER TABLE [dbo].[courses] ADD [enrollment_end_date] DATE NULL;
END
GO

------------------------------------------------------------------------------
-- 2. Chuyển dữ liệu cũ từ training_rounds xuống courses (chỉ khi cột nguồn
--    còn tồn tại và khóa học chưa tự cấu hình cửa sổ riêng).
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.training_rounds', 'enrollment_start_date') IS NOT NULL
BEGIN
    UPDATE c
    SET c.enrollment_start_date = r.enrollment_start_date,
        c.enrollment_end_date   = r.enrollment_end_date
    FROM [dbo].[courses] c
    JOIN [dbo].[training_rounds] r ON r.id = c.training_round_id
    WHERE c.enrollment_start_date IS NULL
      AND c.enrollment_end_date IS NULL
      AND (r.enrollment_start_date IS NOT NULL OR r.enrollment_end_date IS NOT NULL);
END
GO

------------------------------------------------------------------------------
-- 3. Bỏ cửa sổ đăng ký khỏi training_rounds — đợt đào tạo giờ chỉ còn là
--    khung thời gian (tên, năm, start/end_date), không quyết định đăng ký.
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.training_rounds', 'enrollment_start_date') IS NOT NULL
BEGIN
    ALTER TABLE [dbo].[training_rounds] DROP COLUMN [enrollment_start_date];
END
GO

IF COL_LENGTH('dbo.training_rounds', 'enrollment_end_date') IS NOT NULL
BEGIN
    ALTER TABLE [dbo].[training_rounds] DROP COLUMN [enrollment_end_date];
END
GO

PRINT N'✅ Migration 2026-09-15_course_enrollment_window hoàn tất.';
GO

-- @migration 2026-09-15_training_program_fields.sql
/* ============================================================================
 * Bổ sung trường cho training_programs (Mã, Thời lượng, Số lượng tối đa, Thứ tự)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Form "Chương trình đào tạo" cần thêm Mã chương trình, Thời lượng,
 *   Số lượng tối đa và Thứ tự hiển thị. Cột thêm đều NULL-able/có default,
 *   không phá dữ liệu hay API hiện có (chỉ thêm field optional).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.training_programs', 'code') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [code] NVARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.training_programs', 'duration') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [duration] NVARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.training_programs', 'max_capacity') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [max_capacity] INT NULL;
GO
IF COL_LENGTH('dbo.training_programs', 'display_order') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [display_order] INT NOT NULL
        CONSTRAINT DF_training_programs_display_order DEFAULT (0);
GO

PRINT N'✅ Migration 2026-09-15_training_program_fields hoàn tất.';
GO

-- @migration 2026-09-16_certificates_lifecycle.sql
/* ============================================================================
 * Vòng đời chứng chỉ: hạn sử dụng + thu hồi mềm (certificates)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu QLNCKHDTCDT-main: dt_chung_chi có ngay_het_han + trang_thai
 *   (Đã cấp/Thu hồi). certificates ở RMS hiện chỉ có issue_date, và hàm
 *   removeCertificate() là DELETE cứng dù UI gọi là "thu hồi" — mất dữ liệu/
 *   lịch sử. Bổ sung status + expiry_date + revoked_at/by/reason để hỗ trợ
 *   thu hồi mềm (giữ lại dòng dữ liệu), tách biệt với xoá cứng (dùng khi nhập
 *   nhầm).
 *
 *   Không thêm permission mới — dùng lại courses:approve (đã dùng cho issue/
 *   remove certificate).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.certificates', 'status') IS NULL
    ALTER TABLE [dbo].[certificates] ADD [status] VARCHAR(15) NOT NULL
        CONSTRAINT DF_certificates_status DEFAULT ('active');
GO
IF COL_LENGTH('dbo.certificates', 'expiry_date') IS NULL
    ALTER TABLE [dbo].[certificates] ADD [expiry_date] DATE NULL;
GO
IF COL_LENGTH('dbo.certificates', 'revoked_at') IS NULL
    ALTER TABLE [dbo].[certificates] ADD [revoked_at] DATETIME NULL;
GO
IF COL_LENGTH('dbo.certificates', 'revoked_by') IS NULL
    ALTER TABLE [dbo].[certificates] ADD [revoked_by] VARCHAR(20) NULL;
GO
IF COL_LENGTH('dbo.certificates', 'revoke_reason') IS NULL
    ALTER TABLE [dbo].[certificates] ADD [revoke_reason] NVARCHAR(255) NULL;
GO

PRINT N'✅ Migration 2026-09-16_certificates_lifecycle hoàn tất.';
GO

-- @migration 2026-09-16_cme_records.sql
/* ============================================================================
 * Ghi nhận tín chỉ CME độc lập (cme_records) — không bắt buộc qua seminar
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu QLNCKHDTCDT-main: dt_cme_ghi_nhan cho phép ghi nhận tín chỉ CME
 *   trực tiếp cho từng nhân viên (tự học, học online, minh chứng đính kèm),
 *   không bắt buộc gắn 1 sự kiện hội thảo cụ thể — khác cơ chế hiện tại của
 *   RMS (mọi CME đều xuất phát từ seminar_participants, gắn 1 seminar_id).
 *   Bổ sung bảng cme_records để phủ trường hợp này, dùng lại danh mục
 *   cme_credit_categories (đã có group_id/conversion_method/conversion_value
 *   từ 2026-09-14_cme_credit_conversion.sql) để gợi ý số tín chỉ.
 *
 *   Minh chứng đính kèm tái dùng kho file polymorphic training_files
 *   (entity_type = 'cme_evidence'), đúng convention đã thiết lập ở
 *   2026-09-11_training_results.sql thay vì tạo bảng file riêng.
 *
 *   Số liệu "earned" ở trang Cảnh báo tín chỉ CME (CmeCompliance) cần cộng
 *   dồn thêm nguồn này bên cạnh seminar_participants.cme_credits — xử lý ở
 *   tầng service (backend), không cần thay đổi schema thêm.
 *
 *   Không thêm permission mới — dùng lại seminars:cme_manage (đúng convention
 *   gộp permission theo cụm CME).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.cme_records', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[cme_records] (
        [id]               VARCHAR(20)   NOT NULL PRIMARY KEY,
        [user_id]          VARCHAR(20)   NOT NULL,
        [category_id]      VARCHAR(20)   NULL,
        [title]            NVARCHAR(255) NOT NULL,
        [activity_date]    DATE          NOT NULL,
        [year]             AS (YEAR([activity_date])) PERSISTED,
        [credits]          DECIMAL(6,2)  NOT NULL,
        [evidence_file_id] VARCHAR(20)   NULL,
        [note]             NVARCHAR(500) NULL,
        [created_at]       DATETIME      NOT NULL CONSTRAINT DF_cme_records_created_at DEFAULT (GETDATE()),
        [created_by]       VARCHAR(20)   NULL,
        [updated_at]       DATETIME      NULL,
        [updated_by]       VARCHAR(20)   NULL,
        CONSTRAINT FK_cmerec_user       FOREIGN KEY ([user_id])          REFERENCES [dbo].[users]                 ([id]),
        CONSTRAINT FK_cmerec_category   FOREIGN KEY ([category_id])      REFERENCES [dbo].[cme_credit_categories] ([id]),
        CONSTRAINT FK_cmerec_evidence   FOREIGN KEY ([evidence_file_id]) REFERENCES [dbo].[training_files]        ([id])
    );
    CREATE NONCLUSTERED INDEX [IX_cme_records_user_year] ON [dbo].[cme_records] ([user_id], [year]);
END
GO

PRINT N'✅ Migration 2026-09-16_cme_records hoàn tất.';
GO

-- @migration 2026-09-16_course_documents_extra.sql
/* ============================================================================
 * Phân loại bài kiểm tra + đếm lượt tải cho course_documents
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu QLNCKHDTCDT-main: dt_bai_kiem_tra phân loại loai_bkt (Thường
 *   xuyên/Giữa kỳ/Cuối kỳ); dt_tai_lieu có incDownload đếm lượt tải. Ở RMS,
 *   "tài liệu" và "bài kiểm tra" đã gộp 1 khái niệm course_documents
 *   (doc_type: material/test_question/test_answer, xem 2026-09-11_training_
 *   results.sql) — giữ nguyên quyết định gộp đó, chỉ bổ sung 2 cột còn thiếu:
 *   exam_type (chỉ có ý nghĩa khi doc_type là test_question/test_answer) và
 *   download_count.
 *
 *   Không thêm permission mới — dùng lại courses:read/courses:update.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.course_documents', 'download_count') IS NULL
    ALTER TABLE [dbo].[course_documents] ADD [download_count] INT NOT NULL
        CONSTRAINT DF_course_documents_download_count DEFAULT (0);
GO
IF COL_LENGTH('dbo.course_documents', 'exam_type') IS NULL
    ALTER TABLE [dbo].[course_documents] ADD [exam_type] VARCHAR(20) NULL;
GO

PRINT N'✅ Migration 2026-09-16_course_documents_extra hoàn tất.';
GO

-- @migration 2026-09-16_course_prerequisites_objectives.sql
/* ============================================================================
 * Thêm "Điều kiện" và "Mục tiêu" cho khóa học (courses)
 * ----------------------------------------------------------------------------
 * Cả hai đều là danh sách các mục (hiển thị dạng list đánh số 1..n ở FE) nên
 * lưu dưới dạng chuỗi JSON (mảng string) trong 1 cột NVARCHAR(MAX) — FE/BE tự
 * parse/stringify, không cần bảng phụ vì đây chỉ là text mô tả, không có quan
 * hệ hay thao tác CRUD riêng.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.courses', 'prerequisites') IS NULL
BEGIN
    ALTER TABLE [dbo].[courses] ADD [prerequisites] NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH('dbo.courses', 'objectives') IS NULL
BEGIN
    ALTER TABLE [dbo].[courses] ADD [objectives] NVARCHAR(MAX) NULL;
END
GO

PRINT N'✅ Migration 2026-09-16_course_prerequisites_objectives hoàn tất.';
GO

-- @migration 2026-09-16_course_programs_bridge.sql
/* ============================================================================
 * Bridge N:N giữa Khóa học (courses) và Chương trình đào tạo (training_programs)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   2026-09-11_training_operations đã cố tình đơn giản hóa so với bản gốc
 *   QLNCKHDTCDT-main: 1 course chỉ gắn 1 program qua courses.program_id
 *   (many-to-one), thay vì bridge dt_khoa_hoc_chuong_trinh (N:N, mỗi cặp có
 *   lịch/địa điểm/giảng viên/trạng thái riêng). Nay xác nhận cần đúng mô hình
 *   N:N của bản gốc: 1 chương trình có thể áp dụng cho nhiều khóa/đợt khác
 *   nhau, mỗi lần áp dụng có lịch riêng.
 *
 *   PHẠM VI: chỉ đổi quan hệ courses<->training_programs sang N:N qua bảng
 *   course_programs. Các bảng vận hành con (course_enrollments,
 *   lecturer_assignments, class_sessions, course_documents, grades,
 *   certificates) VẪN trỏ thẳng course_id như hiện tại — không rewire theo
 *   bridge id (khác bản gốc PHP), vì 1 "course" ở RMS đã là 1 lớp học vận
 *   hành cụ thể, không cần tách nhỏ hơn theo từng chương trình áp dụng.
 *
 *   Dữ liệu cũ: mỗi course đang có program_id sẽ được chuyển thành 1 dòng
 *   course_programs (dùng start_date/end_date của course làm giá trị khởi
 *   tạo), sau đó cột courses.program_id bị xoá (theo đúng pattern UPDATE rồi
 *   DROP COLUMN đã dùng ở 2026-09-15_course_enrollment_window.sql).
 *
 *   Không thêm permission mới — dùng lại courses:read/courses:update (sub-
 *   resource của course, đúng convention gộp permission theo cụm).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Bảng bridge course_programs
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.course_programs', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[course_programs] (
        [id]                     VARCHAR(20)   NOT NULL PRIMARY KEY,
        [course_id]              VARCHAR(20)   NOT NULL,
        [program_id]             VARCHAR(20)   NOT NULL,
        [start_date]             DATE          NULL,
        [end_date]               DATE          NULL,
        [location]               NVARCHAR(200) NULL,
        [lecturer_id]            VARCHAR(20)   NULL,
        [external_lecturer_name] NVARCHAR(150) NULL,
        [status]                 VARCHAR(15)   NOT NULL CONSTRAINT DF_course_programs_status DEFAULT ('active'),
        [created_at]             DATETIME      NOT NULL CONSTRAINT DF_course_programs_created_at DEFAULT (GETDATE()),
        [created_by]             VARCHAR(20)   NULL,
        [updated_at]             DATETIME      NULL,
        [updated_by]             VARCHAR(20)   NULL,
        CONSTRAINT FK_crsprog_course   FOREIGN KEY ([course_id])   REFERENCES [dbo].[courses]           ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_crsprog_program  FOREIGN KEY ([program_id])  REFERENCES [dbo].[training_programs] ([id]),
        CONSTRAINT FK_crsprog_lecturer FOREIGN KEY ([lecturer_id]) REFERENCES [dbo].[lecturers]          ([id]),
        CONSTRAINT UQ_crsprog_course_program UNIQUE ([course_id], [program_id])
    );
    CREATE NONCLUSTERED INDEX [IX_course_programs_course]  ON [dbo].[course_programs] ([course_id]);
    CREATE NONCLUSTERED INDEX [IX_course_programs_program] ON [dbo].[course_programs] ([program_id]);
END
GO

------------------------------------------------------------------------------
-- 2. Chuyển dữ liệu cũ: mỗi course có program_id -> 1 dòng course_programs
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.courses', 'program_id') IS NOT NULL
BEGIN
    INSERT INTO [dbo].[course_programs] (id, course_id, program_id, start_date, end_date, status, created_by)
    SELECT
        'CP' + LEFT(REPLACE(NEWID(), '-', ''), 18),
        c.id,
        c.program_id,
        c.start_date,
        c.end_date,
        'active',
        c.created_by
    FROM [dbo].[courses] c
    WHERE c.program_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM [dbo].[course_programs] cp
          WHERE cp.course_id = c.id AND cp.program_id = c.program_id
      );
END
GO

------------------------------------------------------------------------------
-- 3. Bỏ courses.program_id — quan hệ với chương trình giờ đi qua course_programs
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.courses', 'program_id') IS NOT NULL
BEGIN
    DECLARE @fk_name NVARCHAR(128);
    SELECT @fk_name = name FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'dbo.courses')
      AND referenced_object_id = OBJECT_ID(N'dbo.training_programs');
    IF @fk_name IS NOT NULL
        EXEC('ALTER TABLE [dbo].[courses] DROP CONSTRAINT [' + @fk_name + ']');
END
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_courses_program' AND object_id = OBJECT_ID(N'dbo.courses'))
BEGIN
    DROP INDEX [IX_courses_program] ON [dbo].[courses];
END
GO

IF COL_LENGTH('dbo.courses', 'program_id') IS NOT NULL
BEGIN
    ALTER TABLE [dbo].[courses] DROP COLUMN [program_id];
END
GO

PRINT N'✅ Migration 2026-09-16_course_programs_bridge hoàn tất.';
GO

-- @migration 2026-09-16_grades_breakdown.sql
/* ============================================================================
 * Điểm thành phần + xếp loại cho Kết quả học tập (grades)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu QLNCKHDTCDT-main: dt_ket_qua_hoc_tap tách điểm thường xuyên/
 *   giữa kỳ/cuối kỳ + xếp loại + hàm recalc tự tính điểm tổng kết. grades ở
 *   RMS hiện chỉ có 1 cột score (điểm tổng) + result (pass/fail) — không đủ
 *   chi tiết để làm bảng điểm/báo cáo theo đúng nghiệp vụ đào tạo thực tế.
 *
 *   Cột thêm đều NULL-able, không phá dữ liệu/API cũ: nơi nào chỉ set score/
 *   result thủ công (không dùng điểm thành phần) vẫn hoạt động như trước.
 *
 *   Không thêm permission mới — dùng lại courses:update.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.grades', 'regular_score') IS NULL
    ALTER TABLE [dbo].[grades] ADD [regular_score] DECIMAL(5,2) NULL;
GO
IF COL_LENGTH('dbo.grades', 'midterm_score') IS NULL
    ALTER TABLE [dbo].[grades] ADD [midterm_score] DECIMAL(5,2) NULL;
GO
IF COL_LENGTH('dbo.grades', 'final_score') IS NULL
    ALTER TABLE [dbo].[grades] ADD [final_score] DECIMAL(5,2) NULL;
GO
IF COL_LENGTH('dbo.grades', 'classification') IS NULL
    ALTER TABLE [dbo].[grades] ADD [classification] NVARCHAR(20) NULL;
GO

PRINT N'✅ Migration 2026-09-16_grades_breakdown hoàn tất.';
GO

-- @migration 2026-09-16_training_round_phases.sql
/* ============================================================================
 * Giai đoạn con của Đợt đào tạo (training_round_phases)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu QLNCKHDTCDT-main: 1 "Đợt đăng ký" (DT_DotDangKy) có thể chia
 *   thành nhiều giai đoạn (phase) với khoảng thời gian riêng. training_rounds
 *   hiện tại ở RMS chỉ là khung thời gian đơn (start_date/end_date), chưa có
 *   khái niệm giai đoạn con — bổ sung bảng training_round_phases.
 *
 *   Không thêm permission mới — dùng lại training_rounds:* (sub-resource).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.training_round_phases', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[training_round_phases] (
        [id]                VARCHAR(20)   NOT NULL PRIMARY KEY,
        [training_round_id] VARCHAR(20)   NOT NULL,
        [name]              NVARCHAR(150) NOT NULL,
        [start_date]        DATE          NULL,
        [end_date]          DATE          NULL,
        [display_order]     INT           NOT NULL CONSTRAINT DF_trphase_display_order DEFAULT (0),
        [created_at]        DATETIME      NOT NULL CONSTRAINT DF_trphase_created_at DEFAULT (GETDATE()),
        [created_by]        VARCHAR(20)   NULL,
        [updated_at]        DATETIME      NULL,
        [updated_by]        VARCHAR(20)   NULL,
        CONSTRAINT FK_trphase_round FOREIGN KEY ([training_round_id]) REFERENCES [dbo].[training_rounds] ([id]) ON DELETE CASCADE
    );
    CREATE NONCLUSTERED INDEX [IX_trphase_round] ON [dbo].[training_round_phases] ([training_round_id], [display_order]);
END
GO

PRINT N'✅ Migration 2026-09-16_training_round_phases hoàn tất.';
GO

-- @migration 2026-09-17_course_documents_link_support.sql
/* ============================================================================
 * Hỗ trợ tài liệu khóa học dạng link ngoài (bên cạnh upload file)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Người dùng yêu cầu tài liệu khóa học (course_documents) hỗ trợ 3 hình
 *   thức: upload file, upload video, hoặc dán link ngoài (không upload file).
 *   Video xử lý bằng cách nâng giới hạn dung lượng ở uploadTraining.js (xem
 *   TRAINING_MEDIA_MAX_MB), không cần đổi schema riêng cho video.
 *
 *   Thêm source_type ('file'|'link') + external_url; nới file_id từ NOT NULL
 *   sang NULL (khi source_type='link' thì không có file). CHECK đảm bảo đúng
 *   1 trong 2 (file_id hoặc external_url) được set — cùng ý tưởng với
 *   lesson_documents (2026-09-17_program_lessons.sql).
 *
 *   Dữ liệu cũ: ALTER TABLE ADD ... DEFAULT ('file') tự backfill mọi dòng
 *   hiện có với source_type='file' (đã có file_id sẵn) — an toàn cho CHECK.
 *
 *   Không thêm permission mới — dùng lại courses:read/update.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Nới file_id: NOT NULL -> NULL (tài liệu dạng link không có file)
------------------------------------------------------------------------------
IF COLUMNPROPERTY(OBJECT_ID('dbo.course_documents'), 'file_id', 'AllowsNull') = 0
BEGIN
    ALTER TABLE [dbo].[course_documents] ALTER COLUMN [file_id] VARCHAR(20) NULL;
END
GO

------------------------------------------------------------------------------
-- 2. Thêm source_type + external_url
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.course_documents', 'source_type') IS NULL
    ALTER TABLE [dbo].[course_documents] ADD [source_type] VARCHAR(10) NOT NULL
        CONSTRAINT DF_course_documents_source_type DEFAULT ('file');
GO
IF COL_LENGTH('dbo.course_documents', 'external_url') IS NULL
    ALTER TABLE [dbo].[course_documents] ADD [external_url] NVARCHAR(500) NULL;
GO

------------------------------------------------------------------------------
-- 3. CHECK: source_type hợp lệ + file_id/external_url loại trừ nhau
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_course_documents_source_type' AND parent_object_id = OBJECT_ID(N'dbo.course_documents'))
    ALTER TABLE [dbo].[course_documents] WITH CHECK
        ADD CONSTRAINT [CHK_course_documents_source_type] CHECK ([source_type] IN ('file','link'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_course_documents_source_pair' AND parent_object_id = OBJECT_ID(N'dbo.course_documents'))
    ALTER TABLE [dbo].[course_documents] WITH CHECK
        ADD CONSTRAINT [CHK_course_documents_source_pair] CHECK (
            ([source_type] = 'file' AND [file_id] IS NOT NULL AND [external_url] IS NULL) OR
            ([source_type] = 'link' AND [external_url] IS NOT NULL AND [file_id] IS NULL)
        );
GO

PRINT N'✅ Migration 2026-09-17_course_documents_link_support hoàn tất.';
GO

-- @migration 2026-09-17_grades_program.sql
/* ============================================================================
 * Gán điểm (grades) trực tiếp vào chương trình đào tạo cụ thể
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   1 khóa học (course) có thể áp dụng nhiều chương trình đào tạo cùng lúc
 *   (course_programs, N:N — xem 2026-09-16_course_programs_bridge.sql). Khi
 *   cần thống kê kết quả học viên theo từng chương trình trong phạm vi 1 khóa
 *   học, KHÔNG suy ra chương trình qua subject_id (gián tiếp, dễ sai khi 1
 *   môn thuộc nhiều chương trình) — thay vào đó thêm thẳng cột program_id,
 *   do giáo vụ tự chọn khi nhập điểm (dropdown từ course_programs của khóa
 *   đó). program_id là 1 trường bổ sung, ĐỘC LẬP với subject_id, trên cùng 1
 *   dòng điểm — không đổi khóa upsert hiện tại (enrollment_id, subject_id).
 *
 *   Không thêm permission mới — dùng lại courses:read/update.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.grades', 'program_id') IS NULL
    ALTER TABLE [dbo].[grades] ADD [program_id] VARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_grades_program' AND parent_object_id = OBJECT_ID(N'dbo.grades'))
    ALTER TABLE [dbo].[grades] WITH CHECK
        ADD CONSTRAINT [FK_grades_program] FOREIGN KEY ([program_id]) REFERENCES [dbo].[training_programs] ([id]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_grades_program' AND object_id = OBJECT_ID(N'dbo.grades'))
    CREATE NONCLUSTERED INDEX [IX_grades_program] ON [dbo].[grades] ([program_id]);
GO

PRINT N'✅ Migration 2026-09-17_grades_program hoàn tất.';
GO

-- @migration 2026-09-17_program_lessons.sql
/* ============================================================================
 * Bài học (program_lessons) & tài liệu riêng của bài học (lesson_documents)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Người dùng yêu cầu: mỗi chương trình đào tạo (training_programs) có thể
 *   có nhiều "bài học" — đây là KHUNG NỘI DUNG theo thứ tự (giáo trình khung),
 *   khác hẳn với class_sessions (lịch học cụ thể của 1 khóa học, có ngày/giờ/
 *   phòng — xem 2026-09-11_training_operations.sql). "Bài học" thuộc về
 *   chương trình đào tạo (khung, tái sử dụng được cho nhiều khóa), không
 *   thuộc về khóa học (courses).
 *
 *   Mỗi bài học có tài liệu riêng (lesson_documents), mirror course_documents
 *   nhưng bỏ doc_type/exam_type (bài học chỉ có tài liệu, không có khái niệm
 *   bài kiểm tra — điều đó vẫn thuộc course_documents ở cấp khóa học).
 *
 *   Tài liệu hỗ trợ 2 hình thức: upload file (kể cả video, xem giới hạn dung
 *   lượng mới ở uploadTraining.js) hoặc dán link ngoài — source_type +
 *   file_id/external_url loại trừ nhau qua CHECK, cùng ý tưởng áp dụng cho
 *   course_documents ở migration 2026-09-17_course_documents_link_support.
 *
 *   entity_type mới cho training_files: 'lesson_document' (tách khỏi
 *   'course_document' để không lẫn không gian id giữa 2 bảng con).
 *
 *   display_order là số nhập tay (giống training_programs.display_order),
 *   không cần kéo-thả.
 *
 *   Không thêm permission mới — dùng lại training_programs:read/update.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Bài học của chương trình đào tạo
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.program_lessons', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[program_lessons] (
        [id]            VARCHAR(20)   NOT NULL PRIMARY KEY,
        [program_id]    VARCHAR(20)   NOT NULL,
        [title]         NVARCHAR(255) NOT NULL,
        [description]   NVARCHAR(MAX) NULL,
        [display_order] INT           NOT NULL CONSTRAINT DF_program_lessons_display_order DEFAULT (0),
        [created_at]    DATETIME      NOT NULL CONSTRAINT DF_program_lessons_created_at DEFAULT (GETDATE()),
        [created_by]    VARCHAR(20)   NULL,
        [updated_at]    DATETIME      NULL,
        [updated_by]    VARCHAR(20)   NULL,
        CONSTRAINT FK_plesson_program FOREIGN KEY ([program_id]) REFERENCES [dbo].[training_programs] ([id]) ON DELETE CASCADE
    );
    CREATE NONCLUSTERED INDEX [IX_program_lessons_program] ON [dbo].[program_lessons] ([program_id]);
END
GO

------------------------------------------------------------------------------
-- 2. Tài liệu riêng của bài học (file hoặc link, loại trừ nhau)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.lesson_documents', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[lesson_documents] (
        [id]             VARCHAR(20)   NOT NULL PRIMARY KEY,
        [lesson_id]      VARCHAR(20)   NOT NULL,
        [title]          NVARCHAR(255) NOT NULL,
        [source_type]    VARCHAR(10)   NOT NULL CONSTRAINT DF_lesson_documents_source_type DEFAULT ('file'),
        [file_id]        VARCHAR(20)   NULL,
        [external_url]   NVARCHAR(500) NULL,
        [is_public]      BIT           NOT NULL CONSTRAINT DF_lesson_documents_is_public DEFAULT (1),
        [download_count] INT           NOT NULL CONSTRAINT DF_lesson_documents_download_count DEFAULT (0),
        [created_at]     DATETIME      NOT NULL CONSTRAINT DF_lesson_documents_created_at DEFAULT (GETDATE()),
        [created_by]     VARCHAR(20)   NULL,
        CONSTRAINT FK_lsndoc_lesson FOREIGN KEY ([lesson_id]) REFERENCES [dbo].[program_lessons] ([id]) ON DELETE CASCADE,
        CONSTRAINT FK_lsndoc_file   FOREIGN KEY ([file_id])   REFERENCES [dbo].[training_files]    ([id]),
        CONSTRAINT CHK_lsndoc_source_type CHECK ([source_type] IN ('file','link')),
        CONSTRAINT CHK_lsndoc_source_pair CHECK (
            ([source_type] = 'file' AND [file_id] IS NOT NULL AND [external_url] IS NULL) OR
            ([source_type] = 'link' AND [external_url] IS NOT NULL AND [file_id] IS NULL)
        )
    );
    CREATE NONCLUSTERED INDEX [IX_lesson_documents_lesson] ON [dbo].[lesson_documents] ([lesson_id]);
END
GO

PRINT N'✅ Migration 2026-09-17_program_lessons hoàn tất.';
GO

-- @migration 2026-09-18_lesson_programs_bridge.sql
/* ============================================================================
 * Bridge N:N giữa Bài học (program_lessons) và Chương trình đào tạo
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   2026-09-17_program_lessons đã cố tình đơn giản hóa: 1 bài học chỉ gắn 1
 *   chương trình qua program_lessons.program_id (many-to-one). Nay xác nhận
 *   cần N:N thực sự — 1 bài học (nội dung dùng chung) có thể được nhiều
 *   chương trình đào tạo khác nhau cùng sử dụng lại, mỗi chương trình có thể
 *   sắp bài học đó ở thứ tự khác nhau. Đúng mô hình đã áp dụng cho
 *   courses<->training_programs (xem 2026-09-16_course_programs_bridge.sql) —
 *   bridge lesson_programs mirror course_programs.
 *
 *   PHẠM VI: program_lessons trở thành nội dung dùng chung (chỉ còn
 *   title/description), KHÔNG còn thuộc 1 chương trình cụ thể. display_order
 *   chuyển sang bảng bridge (lesson_programs) vì thứ tự là thuộc tính của
 *   "lượt gắn vào 1 chương trình", không phải thuộc tính riêng của bài học.
 *
 *   lesson_documents VẪN trỏ thẳng lesson_id như cũ — tài liệu dùng chung
 *   theo đúng nội dung bài học, bất kể bài học đang gắn ở chương trình nào.
 *
 *   Dữ liệu cũ: mỗi program_lessons đang có program_id sẽ được chuyển thành
 *   1 dòng lesson_programs (dùng display_order cũ), sau đó cột
 *   program_lessons.program_id và display_order bị xoá (theo đúng pattern
 *   UPDATE rồi DROP COLUMN đã dùng ở 2026-09-16_course_programs_bridge.sql).
 *
 *   Không thêm permission mới — dùng lại training_programs:read/update.
 *
 *   lesson_programs.program_id KHÔNG cascade (chỉ lesson_id cascade) — SQL
 *   Server chặn 2 đường CASCADE cùng hội tụ vào 1 bảng; đúng lựa chọn đã dùng
 *   cho course_programs.FK_crsprog_program (course_id cascade, program_id
 *   không). Hệ quả: phải unlinkLesson hết trước khi xoá được 1 training_program
 *   còn bài học đang gắn — service layer không xử lý gì thêm, để lỗi FK tự
 *   chặn giống course_programs.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Bảng bridge lesson_programs
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.lesson_programs', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[lesson_programs] (
        [id]            VARCHAR(20) NOT NULL PRIMARY KEY,
        [lesson_id]     VARCHAR(20) NOT NULL,
        [program_id]    VARCHAR(20) NOT NULL,
        [display_order] INT         NOT NULL CONSTRAINT DF_lesson_programs_display_order DEFAULT (0),
        [created_at]    DATETIME    NOT NULL CONSTRAINT DF_lesson_programs_created_at DEFAULT (GETDATE()),
        [created_by]    VARCHAR(20) NULL,
        CONSTRAINT FK_lsnprog_lesson  FOREIGN KEY ([lesson_id])  REFERENCES [dbo].[program_lessons]   ([id]) ON DELETE CASCADE,
        -- program_id KHÔNG cascade (mirror course_programs.FK_crsprog_program) — SQL
        -- Server chặn 2 đường CASCADE cùng hội tụ vào lesson_programs. Hệ quả: phải gỡ
        -- hết lượt gắn bài học (unlinkLesson) trước khi xoá được 1 training_program,
        -- giống hệt cách course_programs đang chặn xoá chương trình còn khóa áp dụng.
        CONSTRAINT FK_lsnprog_program FOREIGN KEY ([program_id]) REFERENCES [dbo].[training_programs] ([id]),
        CONSTRAINT UQ_lsnprog_lesson_program UNIQUE ([lesson_id], [program_id])
    );
    CREATE NONCLUSTERED INDEX [IX_lesson_programs_lesson]  ON [dbo].[lesson_programs] ([lesson_id]);
    CREATE NONCLUSTERED INDEX [IX_lesson_programs_program] ON [dbo].[lesson_programs] ([program_id]);
END
GO

------------------------------------------------------------------------------
-- 2. Chuyển dữ liệu cũ: mỗi program_lessons có program_id -> 1 dòng lesson_programs
--    Dùng EXEC(N'...') vì program_id có thể đã bị xoá ở lần chạy trước — SQL
--    Server bind cột ngay lúc parse batch dù nằm trong IF chưa chắc chạy,
--    nên phải hoãn parse sang lúc thực thi bằng dynamic SQL.
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.program_lessons', 'program_id') IS NOT NULL
BEGIN
    EXEC(N'
        INSERT INTO [dbo].[lesson_programs] (id, lesson_id, program_id, display_order, created_by)
        SELECT
            ''LP'' + LEFT(REPLACE(NEWID(), ''-'', ''''), 18),
            pl.id,
            pl.program_id,
            pl.display_order,
            pl.created_by
        FROM [dbo].[program_lessons] pl
        WHERE pl.program_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM [dbo].[lesson_programs] lp
              WHERE lp.lesson_id = pl.id AND lp.program_id = pl.program_id
          );
    ');
END
GO

------------------------------------------------------------------------------
-- 3. Bỏ program_lessons.program_id — quan hệ với chương trình giờ đi qua
--    lesson_programs
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.program_lessons', 'program_id') IS NOT NULL
BEGIN
    DECLARE @fk_name NVARCHAR(128);
    SELECT @fk_name = name FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'dbo.program_lessons')
      AND referenced_object_id = OBJECT_ID(N'dbo.training_programs');
    IF @fk_name IS NOT NULL
        EXEC('ALTER TABLE [dbo].[program_lessons] DROP CONSTRAINT [' + @fk_name + ']');
END
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_program_lessons_program' AND object_id = OBJECT_ID(N'dbo.program_lessons'))
BEGIN
    DROP INDEX [IX_program_lessons_program] ON [dbo].[program_lessons];
END
GO

IF COL_LENGTH('dbo.program_lessons', 'program_id') IS NOT NULL
BEGIN
    EXEC(N'ALTER TABLE [dbo].[program_lessons] DROP COLUMN [program_id];');
END
GO

------------------------------------------------------------------------------
-- 4. Bỏ program_lessons.display_order — thứ tự giờ thuộc về lesson_programs
------------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_program_lessons_display_order' AND parent_object_id = OBJECT_ID(N'dbo.program_lessons'))
BEGIN
    ALTER TABLE [dbo].[program_lessons] DROP CONSTRAINT [DF_program_lessons_display_order];
END
GO

IF COL_LENGTH('dbo.program_lessons', 'display_order') IS NOT NULL
BEGIN
    EXEC(N'ALTER TABLE [dbo].[program_lessons] DROP COLUMN [display_order];');
END
GO

PRINT N'✅ Migration 2026-09-18_lesson_programs_bridge hoàn tất.';
GO

-- @migration 2026-09-19_program_lessons_fields.sql
/* ============================================================================
 * Bổ sung trường cho Bài học (program_lessons): mã, trạng thái, số tiết, tín chỉ
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Theo mẫu form "Sửa bài học" người dùng cung cấp, bài học cần thêm: mã bài
 *   học (code, bắt buộc), trạng thái hoạt động (is_active, giống lecturers.
 *   is_active — chỉ 2 trạng thái đơn giản, không cần enum nhiều bước như
 *   courses.status), số tiết lý thuyết/thực hành (theory_hours/practice_hours,
 *   nhập tay), tổng số tiết (total_hours — CỘT TÍNH TOÁN, tự động = lý thuyết +
 *   thực hành, không cho nhập tay, dùng computed column PERSISTED để luôn nhất
 *   quán và query/sort được), số tín chỉ (credits).
 *
 *   code thêm NOT NULL với DEFAULT ('') để backfill an toàn cho dòng có sẵn —
 *   không ràng buộc UNIQUE (mirror training_programs.code, cũng không unique).
 *
 *   Không thêm permission mới — dùng lại training_programs:read/update.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
-- Bắt buộc cho computed column PERSISTED (total_hours) bên dưới.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('dbo.program_lessons', 'code') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [code] NVARCHAR(50) NOT NULL
        CONSTRAINT DF_program_lessons_code DEFAULT ('');
GO
IF COL_LENGTH('dbo.program_lessons', 'is_active') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [is_active] BIT NOT NULL
        CONSTRAINT DF_program_lessons_is_active DEFAULT (1);
GO
IF COL_LENGTH('dbo.program_lessons', 'theory_hours') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [theory_hours] INT NOT NULL
        CONSTRAINT DF_program_lessons_theory_hours DEFAULT (0);
GO
IF COL_LENGTH('dbo.program_lessons', 'practice_hours') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [practice_hours] INT NOT NULL
        CONSTRAINT DF_program_lessons_practice_hours DEFAULT (0);
GO
IF COL_LENGTH('dbo.program_lessons', 'credits') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [credits] INT NOT NULL
        CONSTRAINT DF_program_lessons_credits DEFAULT (0);
GO
IF COL_LENGTH('dbo.program_lessons', 'total_hours') IS NULL
    ALTER TABLE [dbo].[program_lessons] ADD [total_hours] AS ([theory_hours] + [practice_hours]) PERSISTED;
GO

PRINT N'✅ Migration 2026-09-19_program_lessons_fields hoàn tất.';
GO

-- @migration 2026-09-20_drop_training_rounds.sql
/* ============================================================================
 * Xoá "Đợt đào tạo" (training_rounds) khỏi hệ thống
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   training_rounds chỉ là khung thời gian mỏng (tên/năm/ngày) gắn nhãn cho
 *   Khóa học — không có logic đăng ký nào cả, toàn bộ đăng ký (công khai lẫn
 *   nội bộ) đã nằm sẵn ở courses/course_enrollments từ migration
 *   2026-09-15_course_enrollment_window. Quyết định: xoá hẳn khỏi hệ thống
 *   (bảng, cột FK trên courses, quyền liên quan) thay vì chỉ ẩn UI, và thay
 *   khái niệm "đăng ký công khai với người ngoại viện" bằng 1 cờ ngay trên
 *   Khóa học (is_public_registration) — gate cổng đăng ký không cần đăng nhập
 *   (publicPortalService.getOpenCourses).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Cờ đăng ký công khai / nội bộ trên Khóa học.
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.courses', 'is_public_registration') IS NULL
    ALTER TABLE [dbo].[courses] ADD [is_public_registration] BIT NOT NULL CONSTRAINT DF_courses_is_public_registration DEFAULT (0);
GO

------------------------------------------------------------------------------
-- 2. Gỡ FK/index của courses.training_round_id rồi xoá cột.
------------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_courses_round' AND parent_object_id = OBJECT_ID(N'dbo.courses'))
    ALTER TABLE [dbo].[courses] DROP CONSTRAINT [FK_courses_round];
GO
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_courses_round' AND object_id = OBJECT_ID(N'dbo.courses'))
    DROP INDEX [IX_courses_round] ON [dbo].[courses];
GO
IF COL_LENGTH('dbo.courses', 'training_round_id') IS NOT NULL
    ALTER TABLE [dbo].[courses] DROP COLUMN [training_round_id];
GO

------------------------------------------------------------------------------
-- 3. Xoá bảng training_round_phases rồi training_rounds (phases có FK
--    ON DELETE CASCADE tới training_rounds nên xoá phases trước).
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.training_round_phases', N'U') IS NOT NULL
    DROP TABLE [dbo].[training_round_phases];
GO
IF OBJECT_ID(N'dbo.training_rounds', N'U') IS NOT NULL
    DROP TABLE [dbo].[training_rounds];
GO

------------------------------------------------------------------------------
-- 4. Dọn quyền nhóm 'training_rounds' (PERM-TRND-*) — xoá role_permissions
--    trước rồi mới xoá permissions vì role_permissions FK tới permissions.
------------------------------------------------------------------------------
DELETE rp
FROM [dbo].[role_permissions] rp
JOIN [dbo].[permissions] p ON p.id = rp.permission_id
WHERE p.resource = 'training_rounds';
GO
DELETE FROM [dbo].[permissions] WHERE resource = 'training_rounds';
GO

PRINT N'✅ Migration 2026-09-20_drop_training_rounds hoàn tất.';
GO

-- @migration 2026-09-20_trainee_extra_fields.sql
/* ============================================================================
 * Bổ sung hồ sơ học viên: địa chỉ thường trú, là nhân viên hay không
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   trainees đã có address/phone/national_id_issued_date/_place/graduated_year
 *   (2026-09-11_training_foundation, 2026-09-14_staff_practice_licenses) —
 *   còn thiếu địa chỉ THƯỜNG TRÚ (khác address hiện tại — có thể là nơi ở hiện
 *   tại) và cờ tường minh "là nhân viên bệnh viện hay không" (trước giờ chỉ
 *   suy luận ngầm qua department_id có giá trị hay không).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.trainees', 'permanent_address') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [permanent_address] NVARCHAR(255) NULL; -- địa chỉ thường trú
GO
IF COL_LENGTH('dbo.trainees', 'is_employee') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [is_employee] BIT NOT NULL CONSTRAINT DF_trainees_is_employee DEFAULT (0);
GO

PRINT N'✅ Migration 2026-09-20_trainee_extra_fields hoàn tất.';
GO

-- @migration 2026-09-21_trainee_id_generation.sql
/* ============================================================================
 * Sinh mã học viên có ý nghĩa (HV + năm đăng ký + STT) + vá vài lỗ hổng
 * index/rác phát hiện khi rà soát toàn bộ schema
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   1) trainees.id hiện được sinh trong server/src/services/traineeService.js
 *      bằng:  'HV' + LEFT(REPLACE(NEWID(),'-',''), 18)
 *      -> mã ngẫu nhiên, không tra được năm đăng ký, không đồng nhất với toàn
 *      bộ các entity khác trong hệ thống (NV<dept>0001, DEPTxxxx0001,
 *      DOTyyyyN, LDTnn, CD nn, HD<round>_nn, ...) — tất cả đều theo mẫu
 *      PREFIX + (ngữ cảnh) + STT, sinh qua 1 stored procedure sp_gen_*_id
 *      dùng sp_getapplock để tránh đụng số khi nhiều request insert cùng lúc.
 *
 *      -> Theo đúng quy ước đó, mã học viên nên là:
 *            HV + [năm đăng ký, 4 số] + [STT trong năm, 4 số, 01–9999]
 *         Ví dụ: HV20260001, HV20269999.
 *
 *      Đây KHÔNG dùng trigger AFTER/INSTEAD OF INSERT như yêu cầu gốc, vì:
 *        - id là PK và toàn bộ 20+ entity khác trong DB đều sinh mã bằng
 *          stored procedure gọi TRƯỚC INSERT (app gọi sp_gen_xxx_id lấy @new_id
 *          rồi mới INSERT), không phải trigger sau khi ghi.
 *        - Dùng trigger riêng cho 1 bảng sẽ tạo ra 2 kiểu kiến trúc sinh mã
 *          khác nhau trong cùng hệ thống -> tăng "rối" đúng như điều cần dọn.
 *      Nếu vẫn muốn có trigger thật, có thể bọc sp_gen_trainee_id trong 1
 *      INSTEAD OF INSERT trigger sau — nhưng KHÔNG khuyến nghị vì lệch chuẩn.
 *
 *   2) Rà soát toàn bộ FK cho thấy 4 cột FK "nóng" (hay truy vấn ngược từ bảng
 *      cha, hay bị cascade delete) chưa có index riêng:
 *        - course_enrollments.trainee_id (chỉ có index (course_id, trainee_id),
 *          trainee_id không phải cột dẫn đầu -> tra "các khóa học của 1 học
 *          viên" phải scan)
 *        - grades.enrollment_id (không index nào cả)
 *        - attendance.enrollment_id (chỉ có index (session_id, enrollment_id),
 *          enrollment_id không dẫn đầu)
 *        - trainee_documents.trainee_id (không index nào cả, lại có
 *          ON DELETE CASCADE từ trainees -> xoá 1 học viên phải scan toàn bảng
 *          trainee_documents để tìm hồ sơ con)
 *
 *   3) topic_progress có 2 index giống nhau 100%: idx_progress_topic và
 *      idx_tp_topic (cả 2 đều là NONCLUSTERED (topic_id) không INCLUDE gì
 *      khác) — dư 1 cái, chỉ tốn ghi + tốn dung lượng, không lợi gì thêm.
 *
 *   4) sp_gen_notification_id được định nghĩa nhưng không còn nơi nào gọi
 *      (server/src chỉ gọi sp_push_notification, proc này tự sinh id qua
 *      SEQUENCE seq_notification_suffix, không gọi sp_gen_notification_id) —
 *      proc cũ trở thành rác, xoá cho gọn (rollback được: chạy lại CREATE
 *      PROCEDURE nếu cần khôi phục).
 *
 * CÁCH SỬA
 *   - Thêm bảng đếm theo năm trainee_year_register (giống mẫu
 *     cme_year_register/sp_gen_cme_no đã có sẵn trong DB).
 *   - Thêm sp_gen_trainee_id (@year, @actor_id, @new_id OUTPUT) dùng
 *     sp_getapplock + UPDATE...SET @x = col = col + 1 (không dùng
 *     COUNT(*)+1 hay MAX(...) trên bảng trainees vì học viên có thể bị xoá,
 *     dẫn tới trùng số).
 *   - Thêm CHECK CHK_trainees_id (WITH NOCHECK — KHÔNG hồi tố các id kiểu
 *     GUID cũ, chỉ ép định dạng mới từ nay về sau).
 *   - Thêm 4 index còn thiếu ở mục (2), xoá index dư ở mục (3), xoá proc rác
 *     ở mục (4).
 *   - server/src/services/traineeService.js: đổi sang gọi sp_gen_trainee_id
 *     thay vì tự bốc NEWID().
 *
 * Script idempotent (CREATE OR ALTER / IF NOT EXISTS), chạy lại nhiều lần an
 * toàn. Yêu cầu: SQL Server 2016 SP1+ (DB hiện ở compatibility level 150).
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Bảng đếm STT học viên theo năm đăng ký
------------------------------------------------------------------------------
IF OBJECT_ID('dbo.trainee_year_register', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[trainee_year_register](
        [year]       [int]         NOT NULL,
        [last_seq]   [int]         NOT NULL,
        [updated_at] [datetime2](7) NOT NULL,
        [updated_by] [varchar](20) NULL,
        CONSTRAINT [PK_trainee_year_register] PRIMARY KEY CLUSTERED ([year] ASC)
    );

    ALTER TABLE [dbo].[trainee_year_register]
        ADD CONSTRAINT [DF_trainee_year_register_last_seq] DEFAULT ((0)) FOR [last_seq];
    ALTER TABLE [dbo].[trainee_year_register]
        ADD CONSTRAINT [DF_trainee_year_register_updated_at] DEFAULT (getdate()) FOR [updated_at];

    ALTER TABLE [dbo].[trainee_year_register]
        ADD CONSTRAINT [CHK_trainee_year_register_seq] CHECK ([last_seq] >= 0);
    ALTER TABLE [dbo].[trainee_year_register]
        ADD CONSTRAINT [CHK_trainee_year_register_year] CHECK ([year] >= 2000 AND [year] <= 2100);
END
GO

------------------------------------------------------------------------------
-- 2. sp_gen_trainee_id — cấp mã HV<năm><STT 4 số> kế tiếp cho một năm
--    (mẫu theo sp_gen_cme_no; @owner NVARCHAR(20) theo bài học
--    2026-08-28_fix_gen_id_applock_owner)
------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[sp_gen_trainee_id]
    @year     INT          = NULL,   -- NULL = lấy năm hiện tại (năm đăng ký)
    @actor_id VARCHAR(20)  = NULL,
    @new_id   VARCHAR(20)  OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    IF @year IS NULL SET @year = YEAR(GETDATE());
    IF @year < 2000 OR @year > 2100
        THROW 50060, N'Năm đăng ký học viên không hợp lệ', 1;

    DECLARE @owner NVARCHAR(20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @lock_res NVARCHAR(64) = N'gen_trainee_id_' + CAST(@year AS NVARCHAR(10));
    DECLARE @lock_ret INT;

    EXEC @lock_ret = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive',
         @LockOwner = @owner, @LockTimeout = 15000;
    IF @lock_ret < 0
        THROW 50061, N'Không lấy được khóa sinh mã học viên, vui lòng thử lại', 1;

    MERGE dbo.trainee_year_register AS t
    USING (SELECT @year AS y) AS s ON t.[year] = s.y
    WHEN NOT MATCHED THEN INSERT ([year], last_seq, updated_by) VALUES (s.y, 0, @actor_id);

    DECLARE @next_seq INT;
    UPDATE dbo.trainee_year_register
       SET @next_seq = last_seq = last_seq + 1,
           updated_at = GETDATE(), updated_by = @actor_id
     WHERE [year] = @year;

    IF @next_seq > 9999
    BEGIN
        IF @owner = N'Session'
            EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = @owner;
        THROW 50062, N'Đã vượt quá 9999 học viên đăng ký trong năm nay, không thể sinh thêm mã', 1;
    END

    SET @new_id = 'HV' + CAST(@year AS VARCHAR(4)) + RIGHT('0000' + CAST(@next_seq AS VARCHAR(4)), 4);

    IF @owner = N'Session'
        EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = @owner;
    -- Nếu owner = Transaction: khóa tự nhả khi COMMIT/ROLLBACK,
    -- đảm bảo không ai chen vào giữa lúc sinh ID và lúc INSERT.
END;
GO

------------------------------------------------------------------------------
-- 3. CHECK định dạng id — chỉ áp dụng cho dữ liệu mới (WITH NOCHECK để
--    không phá vỡ các id kiểu GUID cũ đã tồn tại trong trainees)
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_trainees_id')
    ALTER TABLE [dbo].[trainees] WITH NOCHECK ADD CONSTRAINT [CHK_trainees_id]
        CHECK ([id] LIKE 'HV[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]');
GO

------------------------------------------------------------------------------
-- 4. Index còn thiếu trên các cột FK hay truy vấn ngược / bị cascade delete
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_course_enrollments_trainee'
               AND object_id = OBJECT_ID('dbo.course_enrollments'))
    CREATE NONCLUSTERED INDEX [IX_course_enrollments_trainee] ON [dbo].[course_enrollments]
    (
        [trainee_id] ASC
    )
    INCLUDE ([course_id], [status]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_grades_enrollment'
               AND object_id = OBJECT_ID('dbo.grades'))
    CREATE NONCLUSTERED INDEX [IX_grades_enrollment] ON [dbo].[grades]
    (
        [enrollment_id] ASC
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_attendance_enrollment'
               AND object_id = OBJECT_ID('dbo.attendance'))
    CREATE NONCLUSTERED INDEX [IX_attendance_enrollment] ON [dbo].[attendance]
    (
        [enrollment_id] ASC
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_trainee_documents_trainee'
               AND object_id = OBJECT_ID('dbo.trainee_documents'))
    CREATE NONCLUSTERED INDEX [IX_trainee_documents_trainee] ON [dbo].[trainee_documents]
    (
        [trainee_id] ASC
    );
GO

------------------------------------------------------------------------------
-- 5. Dọn index trùng lặp 100% trên topic_progress (giữ idx_progress_topic,
--    bỏ idx_tp_topic — cả 2 cùng là NONCLUSTERED (topic_id), không INCLUDE)
------------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_tp_topic' AND object_id = OBJECT_ID('dbo.topic_progress'))
   AND EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_progress_topic' AND object_id = OBJECT_ID('dbo.topic_progress'))
    DROP INDEX [idx_tp_topic] ON [dbo].[topic_progress];
GO

------------------------------------------------------------------------------
-- 6. Dọn stored procedure rác (không còn nơi nào gọi — server/src chỉ dùng
--    sp_push_notification). Rollback: chạy lại CREATE PROCEDURE gốc nếu cần.
------------------------------------------------------------------------------
IF OBJECT_ID('dbo.sp_gen_notification_id', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[sp_gen_notification_id];
GO

/* --------------------------------------------------------------------------
 * Kiểm tra nhanh sau khi chạy migration:
 *
 *   BEGIN TRAN;
 *   DECLARE @id VARCHAR(20);
 *   EXEC sp_gen_trainee_id @year = 2026, @actor_id = NULL, @new_id = @id OUTPUT;
 *   SELECT @id;   -- phải ra "HV20260001" (hoặc STT kế tiếp nếu đã có học viên)
 *   EXEC sp_gen_trainee_id @year = 2026, @actor_id = NULL, @new_id = @id OUTPUT;
 *   SELECT @id;   -- STT phải tăng thêm 1, không trùng lần gọi trước
 *   ROLLBACK;     -- rollback để không thật sự "tiêu" STT khi chỉ test
 * ------------------------------------------------------------------------*/

-- @migration 2026-09-22_training_indexes_and_status_checks.sql
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

-- @migration 2026-09-23_meaningful_ids_sessions_assignments_grades.sql
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

-- @migration 2026-09-24_meaningful_ids_courses_enrollments_certificates.sql
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

-- @migration 2026-09-25_persons_foundation.sql
/* ============================================================================
 * GĐ 1 / Bước 1 — Danh tính hợp nhất (persons)                  [v3 §2.1, FR-C01..C03]
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   "Người" đang bị lưu ở 6 bảng riêng, mỗi bảng tự giữ tên/email/SĐT/ngày sinh:
 *   users, trainees, lecturers, external_reviewers, topic_members,
 *   seminar_participants. users lại gần như không có định danh nào ngoài tên +
 *   staff_number (xem scripts/profiling/gd0_profiling.sql, mục 1.x).
 *
 * MIGRATION NÀY (giai đoạn "expand" — CHỈ THÊM, KHÔNG GỠ, KHÔNG ĐỔI HÀNH VI APP)
 *   1. Bảng dbo.persons + SEQUENCE dbo.seq_person_id (ID 'PS' + 8 số).
 *   2. Bảng dbo.person_merge_candidates: cặp nghi trùng để NGƯỜI duyệt.
 *   3. Cột person_id (NULL, có FK + index) trên 6 bảng nguồn.
 *   4. Backfill: mọi bản ghi nguồn được gắn về đúng 1 person.
 *   5. Hàm chuẩn hóa dbo.fn_normalize_phone.
 *   Các cột trùng lặp cũ (full_name, email, phone...) GIỮ NGUYÊN; app vẫn chạy
 *   như cũ. Việc ghi song song (dual-write) và gỡ cột cũ là các bước sau.
 *
 * QUY TẮC GẮN NGƯỜI (bảo thủ: thà tạo 2 person rồi để người gộp, còn hơn gộp nhầm)
 *   users              → mỗi dòng 1 person (nguồn gốc tin cậy nhất, is_verified=1)
 *   Các nguồn còn lại xét theo thứ tự, mỗi quy tắc CHỈ áp dụng khi khớp ĐÚNG 1 person:
 *     R0 có user_id                          → person của user đó
 *     R1 trùng CCCD                          → person đó
 *     R2 trùng staff_number VÀ trùng tên     → person của user đó
 *     R3 trùng email VÀ trùng tên
 *     R4 trùng SĐT (chuẩn hóa, ≥8 số) VÀ trùng tên
 *     R5 trùng tên VÀ ngày sinh
 *     còn lại                                → tạo person mới (is_verified=0)
 *   Trùng TÊN đơn thuần KHÔNG bao giờ tự gộp — chỉ đưa vào person_merge_candidates.
 *   Cùng nguồn, các dòng cùng khóa (CCCD / staff_number+tên / email+tên / SĐT+tên /
 *   tên+ngày sinh) dùng chung 1 person (vd 1 người dự nhiều hội thảo).
 *
 * KHÔNG LÀM Ở BƯỚC NÀY (cố ý)
 *   - Chưa tạo UNIQUE cho email/SĐT: dữ liệu thật có thể đang trùng; sẽ siết sau
 *     khi xử lý xong person_merge_candidates.
 *   - Chưa tạo staff_profiles/lecturer_profiles...: bước sau.
 *
 * AN TOÀN
 *   - Idempotent: chạy lại chỉ xử lý dòng còn person_id IS NULL.
 *   - Backfill nằm trong 1 transaction. Trigger audit đang BẬT trên 6 bảng nguồn
 *     được tắt tạm trong transaction (để không làm bẩn updated_at/updated_by của
 *     hàng nghìn bản ghi) rồi bật lại đúng trạng thái cũ.
 *   - Rollback: xem cuối file.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

------------------------------------------------------------------------------
-- 1. SEQUENCE + hàm chuẩn hóa
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.seq_person_id', N'SO') IS NULL
    CREATE SEQUENCE [dbo].[seq_person_id] AS BIGINT START WITH 1 INCREMENT BY 1 NO CYCLE NO CACHE;
GO

-- SĐT → chỉ còn chữ số, bỏ số 0 đầu / mã vùng 84. NULL nếu rỗng.
CREATE OR ALTER FUNCTION [dbo].[fn_normalize_phone] (@p VARCHAR(40))
RETURNS VARCHAR(20)
AS
BEGIN
    DECLARE @d VARCHAR(40) = ISNULL(@p, '');
    DECLARE @i INT = PATINDEX('%[^0-9]%', @d);
    WHILE @i > 0
    BEGIN
        SET @d = STUFF(@d, @i, 1, '');
        SET @i = PATINDEX('%[^0-9]%', @d);
    END;
    IF LEFT(@d, 2) = '84' AND LEN(@d) >= 11 SET @d = SUBSTRING(@d, 3, 20);
    ELSE IF LEFT(@d, 1) = '0'               SET @d = SUBSTRING(@d, 2, 20);
    RETURN NULLIF(LEFT(@d, 20), '');
END;
GO

------------------------------------------------------------------------------
-- 2. persons
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.persons', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[persons] (
        [id]             VARCHAR(20)   NOT NULL CONSTRAINT PK_persons PRIMARY KEY,
        [full_name]      NVARCHAR(255) NOT NULL,
        -- khóa so khớp tên: chữ thường, cắt khoảng trắng đầu/cuối và gộp khoảng trắng đôi
        [name_key]       AS (CAST(LOWER(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE([full_name], N'  ', N' '), N'  ', N' '), N'  ', N' ')))) AS NVARCHAR(255))) PERSISTED,
        [date_of_birth]  DATE          NULL,
        [gender]         VARCHAR(10)   NULL,
        [national_id]    VARCHAR(20)   NULL,          -- CCCD / hộ chiếu
        [email]          VARCHAR(255)  NULL,
        [phone]          VARCHAR(20)   NULL,
        [is_internal]    BIT           NULL,          -- 1 nội viện · 0 ngoài viện · NULL chưa xác định
        [is_verified]    BIT           NOT NULL CONSTRAINT DF_persons_is_verified DEFAULT (0),
        [status]         VARCHAR(10)   NOT NULL CONSTRAINT DF_persons_status DEFAULT ('ACTIVE'),
        [merged_into_id] VARCHAR(20)   NULL,
        [origin_table]   VARCHAR(40)   NULL,          -- bảng nguồn khi backfill (truy vết)
        [origin_id]      VARCHAR(30)   NULL,
        [created_at]     DATETIME2(7)  NOT NULL CONSTRAINT DF_persons_created_at DEFAULT (SYSDATETIME()),
        [created_by]     VARCHAR(20)   NULL,
        [updated_at]     DATETIME2(7)  NULL,
        [updated_by]     VARCHAR(20)   NULL,
        CONSTRAINT CHK_persons_id     CHECK ([id] LIKE 'PS[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
        CONSTRAINT CHK_persons_status CHECK ([status] IN ('ACTIVE', 'INACTIVE', 'MERGED')),
        CONSTRAINT CHK_persons_merge  CHECK (([status] = 'MERGED' AND [merged_into_id] IS NOT NULL) OR ([status] <> 'MERGED' AND [merged_into_id] IS NULL)),
        CONSTRAINT FK_persons_merged_into FOREIGN KEY ([merged_into_id]) REFERENCES [dbo].[persons] ([id])
    );
END
GO

-- CCCD: duy nhất khi có (trainees vốn đã UNIQUE nên backfill không vi phạm)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_persons_national_id' AND object_id = OBJECT_ID('dbo.persons'))
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_persons_national_id] ON [dbo].[persons] ([national_id]) WHERE [national_id] IS NOT NULL;
-- Truy vết nguồn: mỗi (bảng nguồn, id nguồn) chỉ tạo tối đa 1 person → backfill chạy lại không nhân đôi
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_persons_origin' AND object_id = OBJECT_ID('dbo.persons'))
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_persons_origin] ON [dbo].[persons] ([origin_table], [origin_id]) WHERE [origin_table] IS NOT NULL;
-- Email / tên: KHÔNG unique ở bước này (xem ghi chú đầu file)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_persons_email' AND object_id = OBJECT_ID('dbo.persons'))
    CREATE NONCLUSTERED INDEX [IX_persons_email] ON [dbo].[persons] ([email]) WHERE [email] IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_persons_name_key' AND object_id = OBJECT_ID('dbo.persons'))
    CREATE NONCLUSTERED INDEX [IX_persons_name_key] ON [dbo].[persons] ([name_key], [date_of_birth]);
GO

------------------------------------------------------------------------------
-- 3. person_merge_candidates — hàng đợi để người duyệt gộp/không gộp
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.person_merge_candidates', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[person_merge_candidates] (
        [id]          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_person_merge_candidates PRIMARY KEY,
        [person_a_id] VARCHAR(20)   NOT NULL,
        [person_b_id] VARCHAR(20)   NOT NULL,
        [reason]      VARCHAR(20)   NOT NULL,   -- SAME_NAME_DOB | SAME_NAME | SAME_PHONE | SAME_EMAIL | SAME_STAFF_NUMBER
        [status]      VARCHAR(10)   NOT NULL CONSTRAINT DF_pmc_status DEFAULT ('PENDING'),  -- PENDING | MERGED | REJECTED
        [note]        NVARCHAR(500) NULL,
        [created_at]  DATETIME2(7)  NOT NULL CONSTRAINT DF_pmc_created_at DEFAULT (SYSDATETIME()),
        [reviewed_by] VARCHAR(20)   NULL,
        [reviewed_at] DATETIME2(7)  NULL,
        CONSTRAINT CHK_pmc_order  CHECK ([person_a_id] < [person_b_id]),     -- mỗi cặp chỉ có 1 chiều
        CONSTRAINT CHK_pmc_reason CHECK ([reason] IN ('SAME_NAME_DOB','SAME_NAME','SAME_PHONE','SAME_EMAIL','SAME_STAFF_NUMBER')),
        CONSTRAINT CHK_pmc_status CHECK ([status] IN ('PENDING','MERGED','REJECTED')),
        CONSTRAINT UQ_pmc_pair    UNIQUE ([person_a_id], [person_b_id], [reason]),
        CONSTRAINT FK_pmc_a FOREIGN KEY ([person_a_id]) REFERENCES [dbo].[persons] ([id]),
        CONSTRAINT FK_pmc_b FOREIGN KEY ([person_b_id]) REFERENCES [dbo].[persons] ([id])
    );
END
GO

------------------------------------------------------------------------------
-- 4. person_id (NULL) + FK + index trên 6 bảng nguồn
------------------------------------------------------------------------------
DECLARE @tables TABLE (name SYSNAME);
INSERT @tables VALUES ('users'), ('trainees'), ('lecturers'), ('external_reviewers'), ('topic_members'), ('seminar_participants');

DECLARE @n SYSNAME, @sql NVARCHAR(MAX);
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM @tables;
OPEN cur;
FETCH NEXT FROM cur INTO @n;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF COL_LENGTH('dbo.' + @n, 'person_id') IS NULL
    BEGIN
        SET @sql = N'ALTER TABLE [dbo].' + QUOTENAME(@n) + N' ADD [person_id] VARCHAR(20) NULL';
        EXEC (@sql);
    END;
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_' + @n + '_person')
    BEGIN
        SET @sql = N'ALTER TABLE [dbo].' + QUOTENAME(@n) + N' ADD CONSTRAINT ' + QUOTENAME('FK_' + @n + '_person')
                 + N' FOREIGN KEY ([person_id]) REFERENCES [dbo].[persons] ([id])';
        EXEC (@sql);
    END;
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_' + @n + '_person_id' AND object_id = OBJECT_ID('dbo.' + @n))
    BEGIN
        SET @sql = N'CREATE NONCLUSTERED INDEX ' + QUOTENAME('IX_' + @n + '_person_id') + N' ON [dbo].' + QUOTENAME(@n)
                 + N' ([person_id]) WHERE [person_id] IS NOT NULL';
        EXEC (@sql);
    END;
    FETCH NEXT FROM cur INTO @n;
END;
CLOSE cur;
DEALLOCATE cur;
GO

------------------------------------------------------------------------------
-- 5. BACKFILL (1 transaction; tắt tạm trigger audit đang bật rồi bật lại)
------------------------------------------------------------------------------
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRANSACTION;

-- 5.0 Tắt trigger đang bật trên 6 bảng nguồn (nhớ lại để bật đúng cái đã tắt)
DECLARE @trg TABLE (tbl SYSNAME, trg SYSNAME);
INSERT @trg (tbl, trg)
SELECT OBJECT_NAME(parent_id), name FROM sys.triggers
WHERE parent_class = 1 AND is_disabled = 0
  AND OBJECT_NAME(parent_id) IN ('users','trainees','lecturers','external_reviewers','topic_members','seminar_participants');

DECLARE @ddl NVARCHAR(MAX) = N'';
SELECT @ddl += N'DISABLE TRIGGER ' + QUOTENAME(trg) + N' ON [dbo].' + QUOTENAME(tbl) + N';' FROM @trg;
IF @ddl <> N'' EXEC (@ddl);

-- 5.1 users → mỗi dòng 1 person
INSERT INTO dbo.persons (id, full_name, date_of_birth, email, phone, is_internal, is_verified, origin_table, origin_id)
SELECT 'PS' + RIGHT('00000000' + CAST(NEXT VALUE FOR dbo.seq_person_id OVER (ORDER BY u.created_at, u.id) AS VARCHAR(8)), 8),
       LTRIM(RTRIM(u.full_name)), u.date_of_birth,
       -- '<id>@member.local' là email giả do luồng cấp tài khoản sinh ra khi thành viên không có email
       CASE WHEN LTRIM(RTRIM(u.email)) LIKE '%@member.local' THEN NULL ELSE NULLIF(LTRIM(RTRIM(u.email)), '') END,
       NULLIF(LEFT(LTRIM(RTRIM(u.phone_number)), 20), ''),
       1, 1, 'users', u.id
FROM dbo.users u
WHERE u.person_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.persons p WHERE p.origin_table = 'users' AND p.origin_id = u.id);

UPDATE u SET person_id = p.id
FROM dbo.users u JOIN dbo.persons p ON p.origin_table = 'users' AND p.origin_id = u.id
WHERE u.person_id IS NULL;

-- 5.2 Gom 5 nguồn còn lại vào #stage (chỉ dòng chưa có person_id)
CREATE TABLE #stage (
    src VARCHAR(30) NOT NULL, src_id VARCHAR(30) NOT NULL, prio TINYINT NOT NULL,
    full_name NVARCHAR(255) NOT NULL, name_key NVARCHAR(255) NOT NULL,
    email VARCHAR(255) NULL, email_key VARCHAR(255) NULL,
    phone VARCHAR(20) NULL, phone_key VARCHAR(20) NULL,
    national_id VARCHAR(20) NULL, staff_number INT NULL, dob DATE NULL, gender VARCHAR(10) NULL,
    is_internal BIT NULL, linked_user_id VARCHAR(20) NULL,
    person_id VARCHAR(20) NULL, grp NVARCHAR(500) NULL,
    PRIMARY KEY (src, src_id)
);

INSERT #stage (src, src_id, prio, full_name, name_key, email, email_key, phone, phone_key, national_id, staff_number, dob, gender, is_internal, linked_user_id)
SELECT v.src, v.src_id, v.prio, v.full_name,
       LOWER(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(v.full_name, N'  ', N' '), N'  ', N' '), N'  ', N' ')))),
       v.email, LOWER(v.email), v.phone, dbo.fn_normalize_phone(v.phone),
       v.national_id, v.staff_number, v.dob, v.gender, v.is_internal, v.linked_user_id
FROM (
    SELECT 'lecturers' AS src, l.id AS src_id, CAST(1 AS TINYINT) AS prio, LTRIM(RTRIM(l.full_name)) AS full_name,
           NULLIF(LTRIM(RTRIM(l.email)), '') AS email, NULLIF(LTRIM(RTRIM(l.phone)), '') AS phone,
           CAST(NULL AS VARCHAR(20)) AS national_id, CAST(NULL AS INT) AS staff_number, l.dob, l.gender,
           CAST(CASE WHEN l.is_external = 1 THEN 0 ELSE 1 END AS BIT) AS is_internal, l.user_id AS linked_user_id
    FROM dbo.lecturers l WHERE l.person_id IS NULL
    UNION ALL
    SELECT 'external_reviewers', r.id, 2, LTRIM(RTRIM(r.full_name)),
           NULLIF(LTRIM(RTRIM(r.email)), ''), NULLIF(LTRIM(RTRIM(r.phone)), ''),
           NULL, NULL, NULL, NULL, CAST(0 AS BIT), NULL
    FROM dbo.external_reviewers r WHERE r.person_id IS NULL
    UNION ALL
    SELECT 'trainees', t.id, 3, LTRIM(RTRIM(t.full_name)),
           NULLIF(LTRIM(RTRIM(t.email)), ''), NULLIF(LTRIM(RTRIM(t.phone)), ''),
           NULLIF(LTRIM(RTRIM(t.national_id)), ''), NULL, t.dob, t.gender, NULL, NULL
    FROM dbo.trainees t WHERE t.person_id IS NULL
    UNION ALL
    SELECT 'topic_members', m.id, 4, LTRIM(RTRIM(m.name)),
           NULLIF(LTRIM(RTRIM(m.email)), ''), NULLIF(LTRIM(RTRIM(m.phone_number)), ''),
           NULL, m.staff_number, NULL, NULL, NULL, m.user_id
    FROM dbo.topic_members m WHERE m.person_id IS NULL
    UNION ALL
    SELECT 'seminar_participants', s.id, 5, LTRIM(RTRIM(s.full_name)),
           NULL, NULL, NULL, s.staff_number, s.dob, s.gender, NULL, s.user_id
    FROM dbo.seminar_participants s WHERE s.person_id IS NULL
) v
WHERE LEN(v.full_name) > 0;

-- email giả do luồng cấp tài khoản sinh ra không phải dữ liệu thật
UPDATE #stage SET email = NULL, email_key = NULL WHERE email LIKE '%@member.local';

-- R0: đã có user_id → person của user
UPDATE s SET person_id = u.person_id
FROM #stage s JOIN dbo.users u ON u.id = s.linked_user_id
WHERE s.person_id IS NULL AND u.person_id IS NOT NULL;

-- 5.3 Xử lý lần lượt từng nguồn (nguồn sau có thể khớp person do nguồn trước vừa tạo)
DECLARE @p TINYINT = 1;
WHILE @p <= 5
BEGIN
    -- khóa nhóm: các dòng cùng khóa mạnh trong CÙNG nguồn dùng chung 1 person
    UPDATE #stage SET grp =
        CASE WHEN national_id IS NOT NULL THEN N'N:' + national_id
             WHEN staff_number IS NOT NULL THEN N'S:' + CAST(staff_number AS NVARCHAR(12)) + N'|' + name_key
             WHEN email_key IS NOT NULL THEN N'E:' + email_key + N'|' + name_key
             WHEN phone_key IS NOT NULL AND LEN(phone_key) >= 8 THEN N'P:' + phone_key + N'|' + name_key
             WHEN dob IS NOT NULL THEN N'D:' + name_key + N'|' + CONVERT(NVARCHAR(10), dob, 23)
             ELSE N'X:' + src + N':' + src_id END
    WHERE prio = @p AND person_id IS NULL;

    -- person hiện có để so khớp (chỉ ACTIVE) kèm SĐT đã chuẩn hóa
    IF OBJECT_ID('tempdb..#pp') IS NOT NULL DROP TABLE #pp;
    SELECT id, name_key, date_of_birth, national_id, LOWER(email) AS email_key, dbo.fn_normalize_phone(phone) AS phone_key
    INTO #pp FROM dbo.persons WHERE status = 'ACTIVE';
    CREATE CLUSTERED INDEX ix_pp ON #pp (name_key);

    -- R1: CCCD
    UPDATE s SET person_id = m.pid
    FROM #stage s
    CROSS APPLY (SELECT MIN(pp.id) AS pid, COUNT(*) AS n FROM #pp pp WHERE pp.national_id = s.national_id) m
    WHERE s.prio = @p AND s.person_id IS NULL AND s.national_id IS NOT NULL AND m.n = 1;

    -- R2: staff_number của user + trùng tên
    UPDATE s SET person_id = m.pid
    FROM #stage s
    CROSS APPLY (SELECT MIN(u.person_id) AS pid, COUNT(DISTINCT u.person_id) AS n
                 FROM dbo.users u JOIN #pp pp ON pp.id = u.person_id
                 WHERE u.staff_number = s.staff_number AND pp.name_key = s.name_key) m
    WHERE s.prio = @p AND s.person_id IS NULL AND s.staff_number IS NOT NULL AND m.n = 1;

    -- R3: email + trùng tên
    UPDATE s SET person_id = m.pid
    FROM #stage s
    CROSS APPLY (SELECT MIN(pp.id) AS pid, COUNT(*) AS n FROM #pp pp WHERE pp.email_key = s.email_key AND pp.name_key = s.name_key) m
    WHERE s.prio = @p AND s.person_id IS NULL AND s.email_key IS NOT NULL AND m.n = 1;

    -- R4: SĐT chuẩn hóa + trùng tên
    UPDATE s SET person_id = m.pid
    FROM #stage s
    CROSS APPLY (SELECT MIN(pp.id) AS pid, COUNT(*) AS n FROM #pp pp WHERE pp.phone_key = s.phone_key AND pp.name_key = s.name_key) m
    WHERE s.prio = @p AND s.person_id IS NULL AND s.phone_key IS NOT NULL AND LEN(s.phone_key) >= 8 AND m.n = 1;

    -- R5: tên + ngày sinh
    UPDATE s SET person_id = m.pid
    FROM #stage s
    CROSS APPLY (SELECT MIN(pp.id) AS pid, COUNT(*) AS n FROM #pp pp WHERE pp.name_key = s.name_key AND pp.date_of_birth = s.dob) m
    WHERE s.prio = @p AND s.person_id IS NULL AND s.dob IS NOT NULL AND m.n = 1;

    -- lan kết quả khớp cho cả nhóm (cùng grp cùng person)
    UPDATE s SET person_id = g.pid
    FROM #stage s JOIN (SELECT grp, MIN(person_id) AS pid FROM #stage WHERE prio = @p AND person_id IS NOT NULL GROUP BY grp) g ON g.grp = s.grp
    WHERE s.prio = @p AND s.person_id IS NULL;

    -- còn lại: mỗi nhóm tạo 1 person mới (thông tin gộp từ mọi dòng trong nhóm)
    IF OBJECT_ID('tempdb..#rep') IS NOT NULL DROP TABLE #rep;
    SELECT grp, full_name, dob, gender, national_id, email, phone, is_internal, src, src_id
    INTO #rep
    FROM (
        SELECT grp, full_name, src, src_id,
               MAX(dob) OVER (PARTITION BY grp) AS dob,           MAX(gender) OVER (PARTITION BY grp) AS gender,
               MAX(national_id) OVER (PARTITION BY grp) AS national_id, MAX(email) OVER (PARTITION BY grp) AS email,
               MAX(phone) OVER (PARTITION BY grp) AS phone,
               CAST(MAX(CAST(is_internal AS TINYINT)) OVER (PARTITION BY grp) AS BIT) AS is_internal,
               ROW_NUMBER() OVER (PARTITION BY grp ORDER BY src_id) AS rn
        FROM #stage WHERE prio = @p AND person_id IS NULL
    ) x WHERE rn = 1;

    IF OBJECT_ID('tempdb..#newp') IS NOT NULL DROP TABLE #newp;
    SELECT CAST(NULL AS VARCHAR(20)) AS person_id, r.* INTO #newp FROM #rep r WHERE 1 = 0;
    INSERT #newp (person_id, grp, full_name, dob, gender, national_id, email, phone, is_internal, src, src_id)
    SELECT 'PS' + RIGHT('00000000' + CAST(NEXT VALUE FOR dbo.seq_person_id OVER (ORDER BY r.src_id) AS VARCHAR(8)), 8),
           r.grp, r.full_name, r.dob, r.gender, r.national_id, r.email, r.phone, r.is_internal, r.src, r.src_id
    FROM #rep r;

    INSERT dbo.persons (id, full_name, date_of_birth, gender, national_id, email, phone, is_internal, is_verified, origin_table, origin_id)
    SELECT n.person_id, n.full_name, n.dob, n.gender, n.national_id, n.email, LEFT(n.phone, 20), n.is_internal, 0, n.src, n.src_id
    FROM #newp n;

    UPDATE s SET person_id = n.person_id
    FROM #stage s JOIN #newp n ON n.grp = s.grp
    WHERE s.prio = @p AND s.person_id IS NULL;

    SET @p += 1;
END;

-- 5.4 Ghi person_id về 5 bảng nguồn
UPDATE t SET person_id = s.person_id FROM dbo.lecturers t            JOIN #stage s ON s.src = 'lecturers'            AND s.src_id = t.id WHERE t.person_id IS NULL;
UPDATE t SET person_id = s.person_id FROM dbo.external_reviewers t   JOIN #stage s ON s.src = 'external_reviewers'   AND s.src_id = t.id WHERE t.person_id IS NULL;
UPDATE t SET person_id = s.person_id FROM dbo.trainees t             JOIN #stage s ON s.src = 'trainees'             AND s.src_id = t.id WHERE t.person_id IS NULL;
UPDATE t SET person_id = s.person_id FROM dbo.topic_members t        JOIN #stage s ON s.src = 'topic_members'        AND s.src_id = t.id WHERE t.person_id IS NULL;
UPDATE t SET person_id = s.person_id FROM dbo.seminar_participants t JOIN #stage s ON s.src = 'seminar_participants' AND s.src_id = t.id WHERE t.person_id IS NULL;

-- 5.5 Cặp nghi trùng để người duyệt (không tự gộp)
-- (a) Cùng staff_number với một user nhưng KHÁC tên
INSERT dbo.person_merge_candidates (person_a_id, person_b_id, reason, note)
SELECT DISTINCT CASE WHEN s.person_id < u.person_id THEN s.person_id ELSE u.person_id END,
                CASE WHEN s.person_id < u.person_id THEN u.person_id ELSE s.person_id END,
                'SAME_STAFF_NUMBER', N'Cùng staff_number ' + CAST(s.staff_number AS NVARCHAR(12)) + N', khác tên (' + s.src + N')'
FROM #stage s
JOIN dbo.users u ON u.staff_number = s.staff_number
JOIN dbo.persons pu ON pu.id = u.person_id
WHERE s.staff_number IS NOT NULL AND s.person_id IS NOT NULL AND s.person_id <> u.person_id AND pu.name_key <> s.name_key
  AND NOT EXISTS (SELECT 1 FROM dbo.person_merge_candidates c
                  WHERE c.reason = 'SAME_STAFF_NUMBER'
                    AND c.person_a_id = CASE WHEN s.person_id < u.person_id THEN s.person_id ELSE u.person_id END
                    AND c.person_b_id = CASE WHEN s.person_id < u.person_id THEN u.person_id ELSE s.person_id END);

-- (b) Cùng TÊN: mỗi person không thuộc users ghép với "mỏ neo" của tên đó (ưu tiên person từ users, rồi id nhỏ nhất).
--     Bỏ qua khi cả hai đều có ngày sinh mà khác nhau (chắc chắn là 2 người).
;WITH r AS (
    SELECT id, name_key, date_of_birth, origin_table,
           ROW_NUMBER() OVER (PARTITION BY name_key ORDER BY CASE WHEN origin_table = 'users' THEN 0 ELSE 1 END, id) AS rn
    FROM dbo.persons WHERE status = 'ACTIVE'
), pairs AS (
    SELECT a.id AS anchor_id, a.date_of_birth AS a_dob, x.id AS other_id, x.date_of_birth AS x_dob
    FROM r x JOIN r a ON a.name_key = x.name_key AND a.rn = 1
    WHERE x.rn > 1 AND (x.origin_table <> 'users' OR x.origin_table IS NULL)
)
INSERT dbo.person_merge_candidates (person_a_id, person_b_id, reason)
SELECT CASE WHEN anchor_id < other_id THEN anchor_id ELSE other_id END,
       CASE WHEN anchor_id < other_id THEN other_id ELSE anchor_id END,
       CASE WHEN a_dob IS NOT NULL AND a_dob = x_dob THEN 'SAME_NAME_DOB' ELSE 'SAME_NAME' END
FROM pairs p
WHERE NOT (a_dob IS NOT NULL AND x_dob IS NOT NULL AND a_dob <> x_dob)
  AND NOT EXISTS (SELECT 1 FROM dbo.person_merge_candidates c
                  WHERE c.person_a_id = CASE WHEN p.anchor_id < p.other_id THEN p.anchor_id ELSE p.other_id END
                    AND c.person_b_id = CASE WHEN p.anchor_id < p.other_id THEN p.other_id ELSE p.anchor_id END
                    AND c.reason IN ('SAME_NAME', 'SAME_NAME_DOB'));

-- (c) Cùng SĐT (≥8 số) hoặc cùng email nhưng KHÁC tên (dùng chung SĐT/email hoặc gõ sai tên)
IF OBJECT_ID('tempdb..#pk') IS NOT NULL DROP TABLE #pk;
SELECT id, name_key, dbo.fn_normalize_phone(phone) AS phone_key, LOWER(email) AS email_key INTO #pk FROM dbo.persons WHERE status = 'ACTIVE';

INSERT dbo.person_merge_candidates (person_a_id, person_b_id, reason)
SELECT DISTINCT CASE WHEN a.id < b.id THEN a.id ELSE b.id END, CASE WHEN a.id < b.id THEN b.id ELSE a.id END, 'SAME_PHONE'
FROM #pk a JOIN #pk b ON a.phone_key = b.phone_key AND a.id < b.id AND a.name_key <> b.name_key
WHERE LEN(a.phone_key) >= 8
  AND NOT EXISTS (SELECT 1 FROM dbo.person_merge_candidates c WHERE c.person_a_id = a.id AND c.person_b_id = b.id AND c.reason = 'SAME_PHONE');

INSERT dbo.person_merge_candidates (person_a_id, person_b_id, reason)
SELECT DISTINCT a.id, b.id, 'SAME_EMAIL'
FROM #pk a JOIN #pk b ON a.email_key = b.email_key AND a.id < b.id AND a.name_key <> b.name_key
WHERE NOT EXISTS (SELECT 1 FROM dbo.person_merge_candidates c WHERE c.person_a_id = a.id AND c.person_b_id = b.id AND c.reason = 'SAME_EMAIL');

-- 5.6 Kiểm tra bất biến trước khi COMMIT: mọi user phải có person
IF EXISTS (SELECT 1 FROM dbo.users WHERE person_id IS NULL)
    THROW 50001, N'Backfill persons thất bại: còn users chưa có person_id. Đã ROLLBACK.', 1;

-- 5.7 Bật lại đúng các trigger đã tắt
SET @ddl = N'';
SELECT @ddl += N'ENABLE TRIGGER ' + QUOTENAME(trg) + N' ON [dbo].' + QUOTENAME(tbl) + N';' FROM @trg;
IF @ddl <> N'' EXEC (@ddl);

COMMIT TRANSACTION;

DROP TABLE #stage;
IF OBJECT_ID('tempdb..#pp')   IS NOT NULL DROP TABLE #pp;
IF OBJECT_ID('tempdb..#rep')  IS NOT NULL DROP TABLE #rep;
IF OBJECT_ID('tempdb..#newp') IS NOT NULL DROP TABLE #newp;
IF OBJECT_ID('tempdb..#pk')   IS NOT NULL DROP TABLE #pk;
GO

------------------------------------------------------------------------------
-- 6. BÁO CÁO SAU MIGRATION (chỉ đọc)
------------------------------------------------------------------------------
SELECT 'persons_by_origin' AS [check], ISNULL(origin_table, '(app)') AS origin, COUNT(*) AS persons,
       SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) AS verified
FROM dbo.persons GROUP BY origin_table ORDER BY persons DESC;

SELECT 'linked_by_source' AS [check], src, total, linked, total - linked AS unlinked FROM (
    SELECT 'users' AS src, COUNT(*) AS total, COUNT(person_id) AS linked FROM dbo.users
    UNION ALL SELECT 'trainees',             COUNT(*), COUNT(person_id) FROM dbo.trainees
    UNION ALL SELECT 'lecturers',            COUNT(*), COUNT(person_id) FROM dbo.lecturers
    UNION ALL SELECT 'external_reviewers',   COUNT(*), COUNT(person_id) FROM dbo.external_reviewers
    UNION ALL SELECT 'topic_members',        COUNT(*), COUNT(person_id) FROM dbo.topic_members
    UNION ALL SELECT 'seminar_participants', COUNT(*), COUNT(person_id) FROM dbo.seminar_participants
) z;

SELECT 'merge_candidates' AS [check], reason, status, COUNT(*) AS pairs FROM dbo.person_merge_candidates GROUP BY reason, status ORDER BY pairs DESC;

-- người thật được nhiều bản ghi nguồn cùng trỏ tới (bằng chứng gộp thành công)
SELECT 'persons_shared_by_multiple_sources' AS [check], COUNT(*) AS persons FROM (
    SELECT person_id FROM (
        SELECT person_id FROM dbo.users UNION ALL SELECT person_id FROM dbo.trainees UNION ALL SELECT person_id FROM dbo.lecturers
        UNION ALL SELECT person_id FROM dbo.external_reviewers UNION ALL SELECT person_id FROM dbo.topic_members
    ) a WHERE person_id IS NOT NULL GROUP BY person_id HAVING COUNT(*) > 1
) z;
GO

/* ============================================================================
 * ROLLBACK (chạy tay nếu cần quay lại; chưa app nào dùng person_id ở bước này)
 * ----------------------------------------------------------------------------
 *   -- 1) gỡ FK + index + cột trên 6 bảng
 *   ALTER TABLE dbo.users                DROP CONSTRAINT FK_users_person;                DROP INDEX IX_users_person_id ON dbo.users;                ALTER TABLE dbo.users                DROP COLUMN person_id;
 *   ALTER TABLE dbo.trainees             DROP CONSTRAINT FK_trainees_person;             DROP INDEX IX_trainees_person_id ON dbo.trainees;          ALTER TABLE dbo.trainees             DROP COLUMN person_id;
 *   ALTER TABLE dbo.lecturers            DROP CONSTRAINT FK_lecturers_person;            DROP INDEX IX_lecturers_person_id ON dbo.lecturers;        ALTER TABLE dbo.lecturers            DROP COLUMN person_id;
 *   ALTER TABLE dbo.external_reviewers   DROP CONSTRAINT FK_external_reviewers_person;   DROP INDEX IX_external_reviewers_person_id ON dbo.external_reviewers; ALTER TABLE dbo.external_reviewers DROP COLUMN person_id;
 *   ALTER TABLE dbo.topic_members        DROP CONSTRAINT FK_topic_members_person;        DROP INDEX IX_topic_members_person_id ON dbo.topic_members; ALTER TABLE dbo.topic_members        DROP COLUMN person_id;
 *   ALTER TABLE dbo.seminar_participants DROP CONSTRAINT FK_seminar_participants_person; DROP INDEX IX_seminar_participants_person_id ON dbo.seminar_participants; ALTER TABLE dbo.seminar_participants DROP COLUMN person_id;
 *   -- 2) gỡ bảng và đối tượng mới
 *   DROP TABLE dbo.person_merge_candidates;
 *   DROP TABLE dbo.persons;
 *   DROP SEQUENCE dbo.seq_person_id;
 *   DROP FUNCTION dbo.fn_normalize_phone;
 * ==========================================================================*/

-- @migration 2026-09-26_person_merge_review.sql
/* ============================================================================
 * GĐ 1 / Bước 3 — Màn hình duyệt gộp danh tính (persons)          [FR-C02]
 * ----------------------------------------------------------------------------
 * Phụ thuộc: 2026-09-25_persons_foundation.sql (persons, person_merge_candidates).
 *
 *  1. dbo.person_merge_log  — nhật ký mỗi lần gộp, KHÔNG xóa/sửa. Lưu ảnh chụp hồ sơ
 *     bị gộp và danh sách bản ghi nguồn đã chuyển → đủ dữ liệu để hoàn tác thủ công
 *     (v3 FR-C02: "không thể hoàn tác trực tiếp" trên giao diện, nhưng phải truy vết được).
 *  2. Quyền persons:read (xem hàng đợi) và persons:merge (gộp / bỏ qua / mở lại),
 *     gán cho VT01 (admin). Không gán cho vai trò khác: gộp danh tính tác động lên
 *     toàn bộ hồ sơ người của hệ thống.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * (sqlcmd cần cờ -I vì bảng có index lọc / cột tính toán.)
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID(N'dbo.person_merge_log', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[person_merge_log] (
        [id]           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_person_merge_log PRIMARY KEY,
        [candidate_id] INT           NULL,             -- cặp duyệt dẫn tới lần gộp (NULL nếu gộp ngoài hàng đợi)
        [kept_id]      VARCHAR(20)   NOT NULL,         -- person giữ lại
        [merged_id]    VARCHAR(20)   NOT NULL,         -- person bị gộp (status = MERGED)
        [merged_snapshot] NVARCHAR(MAX) NOT NULL,      -- JSON: hồ sơ bị gộp trước khi gộp
        [kept_before]  NVARCHAR(MAX) NOT NULL,         -- JSON: hồ sơ giữ lại trước khi gộp
        [moved_json]   NVARCHAR(MAX) NOT NULL,         -- JSON: { "<bảng nguồn>": ["id", ...] } các bản ghi đã chuyển person_id
        [note]         NVARCHAR(500) NULL,
        [merged_by]    VARCHAR(20)   NULL,
        [merged_at]    DATETIME2(7)  NOT NULL CONSTRAINT DF_pml_merged_at DEFAULT (SYSDATETIME()),
        CONSTRAINT FK_pml_kept   FOREIGN KEY ([kept_id])   REFERENCES [dbo].[persons] ([id]),
        CONSTRAINT FK_pml_merged FOREIGN KEY ([merged_id]) REFERENCES [dbo].[persons] ([id]),
        CONSTRAINT FK_pml_cand   FOREIGN KEY ([candidate_id]) REFERENCES [dbo].[person_merge_candidates] ([id])
    );
    CREATE NONCLUSTERED INDEX IX_pml_kept ON [dbo].[person_merge_log] ([kept_id]);
    CREATE NONCLUSTERED INDEX IX_pml_merged ON [dbo].[person_merge_log] ([merged_id]);
END
GO

-- Hàng đợi hay lọc theo (status, reason)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_pmc_status_reason' AND object_id = OBJECT_ID('dbo.person_merge_candidates'))
    CREATE NONCLUSTERED INDEX [IX_pmc_status_reason] ON [dbo].[person_merge_candidates] ([status], [reason]);
GO

MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-PERSON-READ',  N'Xem hàng đợi trùng danh tính', N'Xem các cặp hồ sơ nghi là cùng một người', 'persons', 'read',  10),
    ('PERM-PERSON-MERGE', N'Gộp danh tính',                N'Gộp hai hồ sơ người, bỏ qua hoặc mở lại cặp nghi trùng', 'persons', 'merge', 20)
) AS src (id, name, description, resource, action, sort_order)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, sort_order, created_at, created_by, resource, action)
    VALUES (src.id, src.name, src.description, src.sort_order, GETDATE(), N'SYSTEM', src.resource, src.action)
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description, sort_order = src.sort_order;
GO

MERGE [dbo].[role_permissions] AS tgt
USING (VALUES ('VT01', 'PERM-PERSON-READ'), ('VT01', 'PERM-PERSON-MERGE')) AS src (role_id, permission_id)
ON tgt.role_id = src.role_id AND tgt.permission_id = src.permission_id
WHEN NOT MATCHED BY TARGET
     AND EXISTS (SELECT 1 FROM [dbo].[roles] r WHERE r.id = src.role_id)
     AND EXISTS (SELECT 1 FROM [dbo].[permissions] p WHERE p.id = src.permission_id) THEN
    INSERT (role_id, permission_id, created_by)
    VALUES (src.role_id, src.permission_id, N'SYSTEM');
GO

PRINT N'✅ Migration 2026-09-26_person_merge_review hoàn tất.';
GO

-- @migration 2026-09-27_courses_read_assigned_scope.sql
/* ============================================================================
 * RBAC: thêm quyền courses:read_assigned — giảng viên chỉ thấy khóa được
 * phân công thay vì toàn bộ hệ thống
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   courseService hiện không lọc theo actor: bất kỳ ai có 'courses:read' thấy
 *   TOÀN BỘ khóa học, kể cả không được phân công dạy (bảng lecturer_assignments
 *   không dùng để giới hạn quyền xem, chỉ để hiển thị "ai dạy khóa nào").
 *   Thêm quyền chi tiết 'courses:read_assigned' để bắt đầu giới hạn đúng phạm
 *   vi cho vai trò giảng viên, theo đúng mẫu đã dùng cho topics:read_all /
 *   topics:read_department (2026-08-28_role_based_authz.sql).
 *
 *   QUAN TRỌNG — KHÔNG TỰ ĐỘNG GÁN quyền này cho role nào ở đây. Vai trò nào
 *   đang có 'courses:read' (flat) sẽ TIẾP TỤC thấy toàn bộ khóa học như cũ —
 *   hành vi hiện tại không đổi cho tới khi admin CHỦ ĐỘNG vào "Hệ thống → Vai
 *   trò & Quyền" gán 'courses:read_assigned' cho vai trò giảng viên (đồng thời
 *   GIỮ 'courses:read' để qua được authorizePermission ở tầng route — scope
 *   hẹp hơn được tính trong scopeFor(), không phải ở route gate).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-CRS-READ-ASGN', N'Xem khóa học được phân công', N'Chỉ xem các khóa học có tên trong lecturer_assignments — dùng cho vai trò giảng viên', 'courses', 'read_assigned', 15)
) AS src (id, name, description, resource, action, sort_order)
ON tgt.id = src.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description, sort_order, created_at, created_by, resource, action)
    VALUES (src.id, src.name, src.description, src.sort_order, GETDATE(), N'SYSTEM', src.resource, src.action)
WHEN MATCHED THEN
    UPDATE SET name = src.name, description = src.description,
               sort_order = src.sort_order, resource = src.resource, action = src.action;
GO

PRINT N'✅ Migration 2026-09-27_courses_read_assigned_scope hoàn tất.';
GO

-- @migration 2026-09-28_00_permission_scopes.sql
/* ============================================================================
   2026-09-28_00_permission_scopes.sql — Nâng cấp mô hình phân quyền
   (tên cũ 20260924_01_permission_scopes.sql — src/database/migrator.js tự đổi
   tên trong schema_migrations). Phải chạy SAU 2026-09-27_courses_read_assigned_scope
   (file đó thêm quyền kiểu cũ courses:read_assigned mà bước 3 quy đổi).

   Chạy qua `npm run migrate`; chạy tay bằng sqlcmd:

     sqlcmd -S <server>,<port> -d RMS_HOSPITAL -U <user> -P <pass> -I -b -f 65001 -i 2026-09-28_00_permission_scopes.sql

   -I bắt buộc (QUOTED_IDENTIFIER ON), -b dừng khi lỗi, -f 65001 đọc file UTF-8.
   sqlcmd bản ODBC 18 mặc định mã hoá kết nối: SQL Server dùng chứng chỉ tự ký
   thì thêm -C (tin chứng chỉ server).

   IDEMPOTENT: chạy lại nhiều lần không sao — mỗi bước tự kiểm tra đã làm chưa.
   Toàn bộ phần đổi dữ liệu nằm trong 1 transaction (XACT_ABORT): lỗi giữa
   chừng thì không thay đổi gì.

   Nội dung:
     1. Cột role_permissions.scope (+ CHECK) — phạm vi dữ liệu của từng lượt
        cấp quyền: đề tài own / department / all, người dùng department / all,
        khoá học assigned / all. Resource khác: NULL.
     2. Quyền mới tách từ quyền "mượn": exams:manage (từ courses:update),
        cme_records:manage (từ seminars:cme_manage) — cấp sẵn cho vai trò đang
        có quyền nguồn.
     3. CHỈ MỘT LẦN, khi DB còn quyền kiểu cũ:
          - phạm vi cũ (topics:read_all, topics:read_department, users:read_all,
            users:read_department, courses:read_assigned) → cột scope;
          - X:manage dạng wildcard → bung thành từng quyền cụ thể của X;
          - xoá các quyền kiểu cũ đó.
        Giữ NGUYÊN quyền hiệu lực của mọi vai trò (logic y hệt
        permissions/scopes.js → normalizeLegacy).
     4. Lượt cấp của resource có phạm vi mà scope còn NULL → phạm vi hẹp nhất.
     5. Đổi tên 2 quyền manage được giữ lại cho đúng việc chúng làm.

   Sau khi chạy: khởi động server bình thường — bước đồng bộ catalog sẽ cập
   nhật nốt tên/nhóm (module, sort_order) các quyền, không đổi quyền nào.
   ============================================================================ */
USE [RMS_HOSPITAL]
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* ─── 1. Cột scope ─────────────────────────────────────────────────────────── */
IF COL_LENGTH('dbo.role_permissions', 'scope') IS NULL
BEGIN
	ALTER TABLE dbo.role_permissions ADD scope VARCHAR(20) NULL;
	PRINT N'1. Đã thêm cột role_permissions.scope';
END
ELSE
	PRINT N'1. Cột role_permissions.scope đã có — bỏ qua';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_role_permissions_scope')
BEGIN
	ALTER TABLE dbo.role_permissions ADD CONSTRAINT CK_role_permissions_scope
		CHECK (scope IS NULL OR scope IN ('own', 'assigned', 'department', 'all'));
	PRINT N'1. Đã thêm ràng buộc CK_role_permissions_scope';
END
GO

BEGIN TRANSACTION;

/* ─── 2. Quyền mới tách ra (cấp sẵn cho vai trò đang có quyền nguồn) ────────── */
IF NOT EXISTS (SELECT 1 FROM dbo.permissions WHERE resource = 'exams' AND action = 'manage')
BEGIN
	INSERT INTO dbo.permissions (id, name, description, module, sort_order, resource, action)
	VALUES ('PERM-EXAM-MANAGE', N'Quản lý thi & kiểm tra',
	        N'Ngân hàng câu hỏi, đề thi, xem và chấm bài làm của học viên',
	        'training', 20100, 'exams', 'manage');

	INSERT INTO dbo.role_permissions (role_id, permission_id)
	SELECT DISTINCT rp.role_id, 'PERM-EXAM-MANAGE'
	FROM dbo.role_permissions rp
	INNER JOIN dbo.permissions p ON p.id = rp.permission_id
	WHERE p.resource = 'courses' AND p.action IN ('update', 'manage');

	PRINT N'2. Đã thêm exams:manage, cấp cho ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' vai trò';
END

IF NOT EXISTS (SELECT 1 FROM dbo.permissions WHERE resource = 'cme_records' AND action = 'manage')
BEGIN
	INSERT INTO dbo.permissions (id, name, description, module, sort_order, resource, action)
	VALUES ('PERM-CMEREC-MANAGE', N'Quản lý ghi nhận CME độc lập',
	        N'Thêm / sửa / xoá / nhập Excel ghi nhận CME ngoài hội thảo của viện, kèm minh chứng',
	        'events', 10100, 'cme_records', 'manage');

	INSERT INTO dbo.role_permissions (role_id, permission_id)
	SELECT DISTINCT rp.role_id, 'PERM-CMEREC-MANAGE'
	FROM dbo.role_permissions rp
	INNER JOIN dbo.permissions p ON p.id = rp.permission_id
	WHERE p.resource = 'seminars' AND p.action IN ('cme_manage', 'manage');

	PRINT N'2. Đã thêm cme_records:manage, cấp cho ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' vai trò';
END

/* ─── 3. Quy đổi quyền kiểu cũ (một lần) ───────────────────────────────────── */
-- Quyền kiểu cũ sẽ bị xoá: phạm vi giả + manage dạng wildcard.
DECLARE @removed TABLE (resource VARCHAR(50) NOT NULL, action VARCHAR(20) NOT NULL, PRIMARY KEY (resource, action));
INSERT INTO @removed (resource, action) VALUES
	('topics', 'read_all'), ('topics', 'read_department'),
	('users', 'read_all'), ('users', 'read_department'),
	('courses', 'read_assigned'),
	('catalog', 'manage'), ('councils', 'manage'), ('courses', 'manage'),
	('departments', 'manage'), ('lecturers', 'manage'), ('notifications', 'manage'),
	('rounds', 'manage'), ('seminars', 'manage'), ('staff_licenses', 'manage'),
	('training_catalog', 'manage'), ('training_programs', 'manage'), ('venues', 'manage');

-- Resource có X:manage phải bung thành các action còn lại. roles / trainees
-- giữ lại manage (quyền thật: phân quyền / cấp tài khoản học viên).
DECLARE @expand TABLE (resource VARCHAR(50) NOT NULL PRIMARY KEY);
INSERT INTO @expand (resource) VALUES
	('catalog'), ('councils'), ('courses'), ('departments'), ('lecturers'), ('notifications'),
	('rounds'), ('seminars'), ('staff_licenses'), ('training_catalog'), ('training_programs'), ('venues'),
	('roles'), ('trainees');

IF EXISTS (
	SELECT 1 FROM dbo.permissions p
	INNER JOIN @removed r ON r.resource = p.resource AND r.action = p.action
)
BEGIN
	-- 3a. Ảnh chụp quyền cũ của từng vai trò
	IF OBJECT_ID('tempdb..#old') IS NOT NULL DROP TABLE #old;
	SELECT rp.role_id, p.resource, p.action
	INTO #old
	FROM dbo.role_permissions rp
	INNER JOIN dbo.permissions p ON p.id = rp.permission_id;

	-- 3b. Phạm vi theo quy tắc cũ (tính TRƯỚC khi đổi gì)
	IF OBJECT_ID('tempdb..#scope') IS NOT NULL DROP TABLE #scope;
	SELECT
		r.id AS role_id,
		CASE
			WHEN EXISTS (SELECT 1 FROM #old o WHERE o.role_id = r.id AND ((o.resource = 'system' AND o.action = 'manage') OR (o.resource = 'topics' AND o.action = 'read_all'))) THEN 'all'
			WHEN EXISTS (SELECT 1 FROM #old o WHERE o.role_id = r.id AND o.resource = 'topics' AND o.action = 'read_department') THEN 'department'
			ELSE 'own'
		END AS topics_scope,
		-- Cũ: không có users:read_all ⇒ luôn bị giới hạn trong khoa
		CASE
			WHEN EXISTS (SELECT 1 FROM #old o WHERE o.role_id = r.id AND ((o.resource = 'system' AND o.action = 'manage') OR (o.resource = 'users' AND o.action = 'read_all'))) THEN 'all'
			ELSE 'department'
		END AS users_scope,
		-- Cũ: courses:read phẳng = xem tất cả; chỉ read_assigned (không kèm manage) mới thu hẹp
		CASE
			WHEN EXISTS (SELECT 1 FROM #old o WHERE o.role_id = r.id AND ((o.resource = 'system' AND o.action = 'manage') OR (o.resource = 'courses' AND o.action = 'manage'))) THEN 'all'
			WHEN EXISTS (SELECT 1 FROM #old o WHERE o.role_id = r.id AND o.resource = 'courses' AND o.action = 'read_assigned') THEN 'assigned'
			ELSE 'all'
		END AS courses_scope
	INTO #scope
	FROM dbo.roles r;

	-- 3c. Thêm quyền cần có theo mô hình mới
	--   - vai trò có X:manage (X trong @expand) → mọi quyền còn lại của X
	--   - vai trò có phạm vi giả → quyền Xem của resource đó
	INSERT INTO dbo.role_permissions (role_id, permission_id)
	SELECT DISTINCT n.role_id, n.permission_id
	FROM (
		SELECT o.role_id, p.id AS permission_id
		FROM #old o
		INNER JOIN @expand e ON e.resource = o.resource AND o.action = 'manage'
		INNER JOIN dbo.permissions p ON p.resource = o.resource
		WHERE NOT EXISTS (SELECT 1 FROM @removed r WHERE r.resource = p.resource AND r.action = p.action)
		UNION
		SELECT o.role_id, p.id
		FROM #old o
		INNER JOIN dbo.permissions p ON p.resource = o.resource AND p.action = 'read'
		WHERE (o.resource = 'topics' AND o.action IN ('read_all', 'read_department'))
		   OR (o.resource = 'users' AND o.action IN ('read_all', 'read_department'))
		   OR (o.resource = 'courses' AND o.action = 'read_assigned')
	) n
	WHERE NOT EXISTS (
		SELECT 1 FROM dbo.role_permissions x
		WHERE x.role_id = n.role_id AND x.permission_id = n.permission_id
	);
	PRINT N'3. Đã cấp bổ sung ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' lượt quyền cụ thể (thay cho manage wildcard / phạm vi giả)';

	-- 3d. Ghi phạm vi cho mọi lượt cấp của resource có phạm vi
	UPDATE rp
	SET scope = CASE p.resource
		WHEN 'topics' THEN s.topics_scope
		WHEN 'users' THEN s.users_scope
		WHEN 'courses' THEN s.courses_scope
	END
	FROM dbo.role_permissions rp
	INNER JOIN dbo.permissions p ON p.id = rp.permission_id
	INNER JOIN #scope s ON s.role_id = rp.role_id
	WHERE p.resource IN ('topics', 'users', 'courses')
	  AND NOT EXISTS (SELECT 1 FROM @removed r WHERE r.resource = p.resource AND r.action = p.action);
	PRINT N'3. Đã ghi phạm vi cho ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' lượt cấp quyền';

	-- 3e. Xoá quyền kiểu cũ (FK_rp_perm ON DELETE CASCADE gỡ luôn lượt cấp)
	DELETE p
	FROM dbo.permissions p
	INNER JOIN @removed r ON r.resource = p.resource AND r.action = p.action;
	PRINT N'3. Đã xoá ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' quyền kiểu cũ';

	DROP TABLE #old;
	DROP TABLE #scope;
END
ELSE
	PRINT N'3. Không còn quyền kiểu cũ — bỏ qua quy đổi';

/* ─── 4. Lượt cấp có phạm vi mà scope còn trống → phạm vi hẹp nhất ─────────── */
UPDATE rp
SET scope = CASE p.resource WHEN 'topics' THEN 'own' WHEN 'users' THEN 'department' WHEN 'courses' THEN 'assigned' END
FROM dbo.role_permissions rp
INNER JOIN dbo.permissions p ON p.id = rp.permission_id
WHERE p.resource IN ('topics', 'users', 'courses') AND rp.scope IS NULL;
DECLARE @filled INT = @@ROWCOUNT;
IF @filled > 0
	PRINT N'4. Đã gán phạm vi hẹp nhất cho ' + CAST(@filled AS NVARCHAR(10)) + N' lượt cấp còn trống';

/* ─── 5. Đổi tên 2 quyền manage được giữ lại ───────────────────────────────── */
UPDATE dbo.permissions
SET name = N'Phân quyền vai trò',
    description = N'Thay đổi tập quyền và phạm vi dữ liệu của vai trò',
    updated_at = GETDATE()
WHERE resource = 'roles' AND action = 'manage' AND name <> N'Phân quyền vai trò';

UPDATE dbo.permissions
SET name = N'Cấp tài khoản học viên',
    description = N'Cấp tài khoản đăng nhập cho học viên (vai trò Học viên)',
    updated_at = GETDATE()
WHERE resource = 'trainees' AND action = 'manage' AND name <> N'Cấp tài khoản học viên';

COMMIT TRANSACTION;
PRINT N'✔ Hoàn tất nâng cấp mô hình phân quyền';
GO

-- @migration 2026-09-28_01_token_version_role_codes.sql
/* ============================================================================
   2026-09-28_01_token_version_role_codes.sql — Phiên đăng nhập & vai trò hệ thống
   (tên cũ 20260924_02_token_version_role_codes.sql). Chạy SAU
   2026-09-28_00_permission_scopes.sql.

     sqlcmd -S <server>,<port> -d RMS_HOSPITAL -U <user> -P <pass> -C -I -b -f 65001 -i 2026-09-28_01_token_version_role_codes.sql

   -I bắt buộc (QUOTED_IDENTIFIER ON), -b dừng khi lỗi, -f 65001 đọc file UTF-8,
   -C tin chứng chỉ tự ký của SQL Server (sqlcmd bản ODBC 18).

   IDEMPOTENT: chạy lại nhiều lần không sao.

   Nội dung:
     1. users.token_version — access token mang claim `tv`; tăng cột này là mọi
        access token cũ của tài khoản hết hiệu lực ngay (reset mật khẩu, đăng
        xuất mọi thiết bị, tự đổi mật khẩu). Token phát trước khi nâng cấp không
        có `tv` được coi là 0 ⇒ vẫn dùng được tới khi hết hạn bình thường.
     2. roles.code (UNIQUE khi có giá trị) — code nghiệp vụ tham chiếu vai trò
        qua mã thay vì id 'VT0x'; roles.is_system — vai trò gốc, không xoá được;
        roles.is_superuser — superuser là thuộc tính của vai trò.
     3. CHỈ MỘT LẦN, khi DB còn quyền system:manage: gán mã + cờ hệ thống cho 8
        vai trò gốc, vai trò đang có system:manage → is_superuser = 1, rồi xoá
        quyền system:manage (không cấp được qua ma trận phân quyền nữa).
   ============================================================================ */

USE [RMS_HOSPITAL]
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* ─── 1–2. Cột mới ─────────────────────────────────────────────────────────── */
IF COL_LENGTH('dbo.users', 'token_version') IS NULL
BEGIN
	ALTER TABLE dbo.users ADD token_version INT NOT NULL CONSTRAINT DF_users_token_version DEFAULT 0;
	PRINT N'1. Đã thêm cột users.token_version';
END
ELSE
	PRINT N'1. Cột users.token_version đã có — bỏ qua';

IF COL_LENGTH('dbo.roles', 'code') IS NULL
BEGIN
	ALTER TABLE dbo.roles ADD code VARCHAR(30) NULL;
	PRINT N'2. Đã thêm cột roles.code';
END

IF COL_LENGTH('dbo.roles', 'is_system') IS NULL
BEGIN
	ALTER TABLE dbo.roles ADD is_system BIT NOT NULL CONSTRAINT DF_roles_is_system DEFAULT 0;
	PRINT N'2. Đã thêm cột roles.is_system';
END

IF COL_LENGTH('dbo.roles', 'is_superuser') IS NULL
BEGIN
	ALTER TABLE dbo.roles ADD is_superuser BIT NOT NULL CONSTRAINT DF_roles_is_superuser DEFAULT 0;
	PRINT N'2. Đã thêm cột roles.is_superuser';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_roles_code' AND object_id = OBJECT_ID('dbo.roles'))
BEGIN
	CREATE UNIQUE INDEX UX_roles_code ON dbo.roles(code) WHERE code IS NOT NULL;
	PRINT N'2. Đã tạo chỉ mục UNIQUE UX_roles_code';
END
GO

/* ─── 3. Mã vai trò + superuser (một lần) ──────────────────────────────────── */
BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM dbo.permissions WHERE resource = 'system' AND action = 'manage')
BEGIN
	-- Mã cố định — khớp services/roleCodes.js (LEGACY_ROLE_IDS)
	DECLARE @codes TABLE (id VARCHAR(20) NOT NULL PRIMARY KEY, code VARCHAR(30) NOT NULL);
	INSERT INTO @codes (id, code) VALUES
		('VT01', 'admin'),
		('VT02', 'director'),
		('VT03', 'research_manager'),
		('VT04', 'review_council'),
		('VT05', 'topic_leader'),
		('VT06', 'member'),
		('VT07', 'dept_head'),  -- "Trưởng khoa" = tài khoản khoa dùng chung
		('VT08', 'trainee');

	UPDATE r SET code = c.code
	FROM dbo.roles r
	INNER JOIN @codes c ON c.id = r.id
	WHERE r.code IS NULL
	  AND NOT EXISTS (SELECT 1 FROM dbo.roles x WHERE x.code = c.code);
	PRINT N'3. Đã gán mã cho ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' vai trò';

	UPDATE r SET is_system = 1
	FROM dbo.roles r
	INNER JOIN @codes c ON c.id = r.id
	WHERE r.is_system = 0;

	UPDATE dbo.roles SET is_superuser = 1
	WHERE is_superuser = 0
	  AND id IN (
		SELECT rp.role_id
		FROM dbo.role_permissions rp
		INNER JOIN dbo.permissions p ON p.id = rp.permission_id
		WHERE p.resource = 'system' AND p.action = 'manage'
	  );
	PRINT N'3. Đánh dấu superuser cho ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' vai trò';

	-- FK_rp_perm ON DELETE CASCADE gỡ luôn các lượt cấp system:manage
	DELETE FROM dbo.permissions WHERE resource = 'system' AND action = 'manage';
	PRINT N'3. Đã bỏ quyền system:manage (superuser giờ là cờ roles.is_superuser)';
END
ELSE
	PRINT N'3. Không còn quyền system:manage — bỏ qua';

COMMIT TRANSACTION;

-- Kiểm tra nhanh: phải có đúng 1 vai trò superuser và đủ 8 mã
SELECT id, name, code, is_system, is_superuser FROM dbo.roles ORDER BY id;
PRINT N'✔ Hoàn tất nâng cấp phiên đăng nhập & vai trò hệ thống';
GO

-- @migration 2026-09-28_trainee_accounts.sql
/* ============================================================================
 * D0 — Cấp tài khoản đăng nhập cho học viên (nền tảng cho Điểm danh QR + Thi
 * online, Giai đoạn D)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   trainees hiện không có cách nào liên kết tới users — khác hẳn topic_members
 *   (đã có account_granted/account_granted_at/user_id + cơ chế "Cấp tài khoản").
 *   Thêm đúng 3 cột tương tự cho trainees, và 1 vai trò mới VT08 "Học viên" với
 *   quyền tối thiểu (chỉ xem dữ liệu CỦA CHÍNH MÌNH — khóa học/điểm/chứng chỉ/
 *   điểm danh — chặn bằng cách đối chiếu trainees.user_id = actor.id ở tầng
 *   service, không cần permission scope riêng).
 *
 *   VT08 chưa từng dùng (đã xác nhận qua GET /roles trước khi viết migration
 *   này) — an toàn để dùng làm mã vai trò mới.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. trainees: thêm liên kết tài khoản (mirror topic_members)
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.trainees', 'user_id') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [user_id] VARCHAR(20) NULL
        CONSTRAINT FK_trainees_user FOREIGN KEY REFERENCES [dbo].[users] ([id]);
GO
IF COL_LENGTH('dbo.trainees', 'account_granted') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [account_granted] BIT NOT NULL
        CONSTRAINT DF_trainees_account_granted DEFAULT (0);
GO
IF COL_LENGTH('dbo.trainees', 'account_granted_at') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [account_granted_at] DATETIME NULL;
GO

------------------------------------------------------------------------------
-- 2. Vai trò mới: VT08 "Học viên"
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM [dbo].[roles] WHERE [id] = 'VT08')
    INSERT INTO [dbo].[roles] (id, name, description, created_at, created_by)
    VALUES ('VT08', N'hoc_vien', N'Học viên — tự xem khóa học/điểm/chứng chỉ của mình, điểm danh QR, làm bài thi', GETDATE(), N'SYSTEM');
GO

PRINT N'✅ Migration 2026-09-28_trainee_accounts hoàn tất.';
GO

-- @migration 2026-09-29_training_plans.sql
/* ============================================================================
 * Kế hoạch đào tạo theo năm (training_plans) — Giai đoạn D2
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Module mới, độc lập với training_programs (chương trình khung) và
 *   training_rounds (đợt đăng ký đề tài NCKH — đã bị xoá ở
 *   2026-09-20_drop_training_rounds). Đây là kế hoạch ĐÀO TẠO theo năm/khoa,
 *   dùng để lập dự trù số lượt đào tạo cần tổ chức (training_plan_items),
 *   không tự động sinh khóa học (courses) — chỉ là công cụ lập kế hoạch, việc
 *   mở khóa học thật vẫn làm thủ công ở module Khóa học như hiện tại.
 *
 *   Quyền: 1 permission 'manage' duy nhất (theo mẫu
 *   2026-09-14_system_settings.sql) — đây không phải danh mục CRUD nhiều
 *   người dùng, chỉ phòng đào tạo/quản trị lập kế hoạch nên không cần tách
 *   read/create/update/delete. Mặc định chỉ gán cho VT01, admin có thể gán
 *   thêm cho vai trò khác qua màn hình Vai trò nếu cần.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. Kế hoạch đào tạo theo năm
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.training_plans', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[training_plans] (
        [id]            VARCHAR(20)   NOT NULL PRIMARY KEY,
        [department_id] VARCHAR(20)   NULL,
        [year]          INT           NOT NULL,
        [title]         NVARCHAR(255) NOT NULL,
        [description]   NVARCHAR(MAX) NULL,
        [status]        VARCHAR(20)   NOT NULL CONSTRAINT DF_training_plans_status DEFAULT ('draft'),
        [created_at]    DATETIME      NOT NULL CONSTRAINT DF_training_plans_created_at DEFAULT (GETDATE()),
        [created_by]    VARCHAR(20)   NULL,
        [updated_at]    DATETIME      NULL,
        [updated_by]    VARCHAR(20)   NULL,
        CONSTRAINT FK_trnplan_department FOREIGN KEY ([department_id]) REFERENCES [dbo].[departments] ([id]),
        CONSTRAINT CHK_trnplan_status CHECK ([status] IN ('draft', 'active', 'completed', 'cancelled'))
    );
    CREATE NONCLUSTERED INDEX [IX_training_plans_year] ON [dbo].[training_plans] ([year]);
    CREATE NONCLUSTERED INDEX [IX_training_plans_department] ON [dbo].[training_plans] ([department_id]);
END
GO

------------------------------------------------------------------------------
-- 2. Hạng mục trong kế hoạch (theo quý)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.training_plan_items', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[training_plan_items] (
        [id]           VARCHAR(20)   NOT NULL PRIMARY KEY,
        [plan_id]      VARCHAR(20)   NOT NULL,
        [title]        NVARCHAR(255) NOT NULL,
        [quarter]      INT           NULL,
        [target_count] INT           NULL,
        [note]         NVARCHAR(MAX) NULL,
        [created_at]   DATETIME      NOT NULL CONSTRAINT DF_training_plan_items_created_at DEFAULT (GETDATE()),
        [created_by]   VARCHAR(20)   NULL,
        CONSTRAINT FK_trnplanitem_plan FOREIGN KEY ([plan_id]) REFERENCES [dbo].[training_plans] ([id]) ON DELETE CASCADE,
        CONSTRAINT CHK_trnplanitem_quarter CHECK ([quarter] IS NULL OR [quarter] BETWEEN 1 AND 4)
    );
    CREATE NONCLUSTERED INDEX [IX_training_plan_items_plan] ON [dbo].[training_plan_items] ([plan_id]);
END
GO

------------------------------------------------------------------------------
-- 3. Quyền mới — resource 'training_plans', chỉ MANAGE.
------------------------------------------------------------------------------
MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-TRNPLAN-MANAGE', N'Quản lý kế hoạch đào tạo', N'Lập/sửa/xoá kế hoạch đào tạo theo năm và các hạng mục trong kế hoạch', 'training_plans', 'manage', 10)
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
    ('VT01','PERM-TRNPLAN-MANAGE')
) AS src (role_id, permission_id)
ON tgt.role_id = src.role_id AND tgt.permission_id = src.permission_id
WHEN NOT MATCHED BY TARGET
     AND EXISTS (SELECT 1 FROM [dbo].[roles] r WHERE r.id = src.role_id)
     AND EXISTS (SELECT 1 FROM [dbo].[permissions] p WHERE p.id = src.permission_id) THEN
    INSERT (role_id, permission_id, created_by)
    VALUES (src.role_id, src.permission_id, N'SYSTEM');
GO

PRINT N'✅ Migration 2026-09-29_training_plans hoàn tất.';
GO

-- @migration 2026-09-30_topics_featured.sql
/* ============================================================================
 * Thư viện đề tài công khai (topics.is_featured) — Giai đoạn D3
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Không tạo bảng mới — chỉ đánh dấu đề tài NÀO được đưa ra trang công khai
 *   "Thư viện đề tài" (chỉ đề tài đã duyệt mới lộ ra, lọc thêm ở tầng service
 *   publicPortalService.getFeaturedTopics(), không chỉ dựa vào cờ này).
 *   Không thêm permission mới — bật/tắt cờ dùng chung quyền 'topics:update'
 *   đã có (sửa qua TopicModal.tsx, chỉ hiện khi status='approved').
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.topics', 'is_featured') IS NULL
BEGIN
    ALTER TABLE [dbo].[topics] ADD [is_featured] BIT NOT NULL CONSTRAINT DF_topics_is_featured DEFAULT (0);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'IX_topics_is_featured' AND object_id = OBJECT_ID('dbo.topics')
)
BEGIN
    CREATE NONCLUSTERED INDEX [IX_topics_is_featured] ON [dbo].[topics] ([is_featured]) WHERE [is_featured] = 1;
END
GO

PRINT N'✅ Migration 2026-09-30_topics_featured hoàn tất.';
GO
