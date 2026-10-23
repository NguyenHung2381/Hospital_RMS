/* ============================================================================
 * 2026-08-30_gop_thang_08 — gộp 5 migration 2026-08-27 → 2026-08-30
 * ----------------------------------------------------------------------------
 *   Nội dung NGUYÊN VĂN các file cũ, đúng thứ tự cũ. Mỗi phần mở đầu bằng dòng
 *   "-- @migration <tên file cũ>". Runner chỉ chạy phần DB chưa ghi nhận; DB đã
 *   chạy đủ các file cũ thì chỉ ghi nhận file này, không chạy lại gì.
 *   Không sửa phần cũ — cần đổi gì thì viết migration mới (database/README.md).
 * ==========================================================================*/

-- @migration 2026-08-27_add_round_type.sql
/* ============================================================================
 * Phân loại đợt nghiên cứu (round_type)
 * ----------------------------------------------------------------------------
 * - Tạo bảng danh mục dbo.round_types (quản lý ở màn "Quản lý Danh mục").
 * - Thêm FK research_rounds.round_type_id -> round_types(id), BẮT BUỘC (NOT NULL).
 * - Seed 3 loại mặc định + backfill các đợt hiện có.
 * Script idempotent, chạy lại nhiều lần an toàn.
 * ==========================================================================*/

------------------------------------------------------------------------------
-- 1. Bảng danh mục loại đợt (khớp cấu trúc levels / categories)
------------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.round_types', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.round_types (
        id          VARCHAR(6)    NOT NULL CONSTRAINT PK_round_types PRIMARY KEY,
        name        NVARCHAR(255) NOT NULL,
        description NVARCHAR(MAX)  NULL,
        created_at  DATETIME2(7)  NOT NULL CONSTRAINT DF_round_types_created_at DEFAULT GETDATE(),
        created_by  VARCHAR(20)   NULL,
        updated_at  DATETIME2(7)  NULL,
        updated_by  VARCHAR(20)   NULL,
        CONSTRAINT CHK_round_types_id CHECK (id LIKE 'RT[0-9][0-9]')
    );
END
GO

------------------------------------------------------------------------------
-- 2. Seed loại đợt mặc định
------------------------------------------------------------------------------
MERGE dbo.round_types AS t
USING (VALUES
    ('RT01', N'Nghiên cứu khoa học', N'Đề tài nghiên cứu khoa học các cấp'),
    ('RT02', N'Bài báo',             N'Đợt đăng ký viết / công bố bài báo'),
    ('RT03', N'Sáng kiến',           N'Sáng kiến, cải tiến kỹ thuật')
) AS s (id, name, description)
ON t.id = s.id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (id, name, description) VALUES (s.id, s.name, s.description);
GO

------------------------------------------------------------------------------
-- 3. Cột FK trên research_rounds
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.research_rounds', N'round_type_id') IS NULL
BEGIN
    ALTER TABLE dbo.research_rounds ADD round_type_id VARCHAR(6) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_rr_round_type')
BEGIN
    ALTER TABLE dbo.research_rounds
        ADD CONSTRAINT FK_rr_round_type FOREIGN KEY (round_type_id)
            REFERENCES dbo.round_types (id);
END
GO

------------------------------------------------------------------------------
-- 4. Backfill các đợt hiện có (loại suy từ tên đợt trước đây)
------------------------------------------------------------------------------
UPDATE dbo.research_rounds SET round_type_id = 'RT02'
WHERE round_type_id IS NULL AND LOWER(name) LIKE N'%bài báo%';

UPDATE dbo.research_rounds SET round_type_id = 'RT03'
WHERE round_type_id IS NULL AND LOWER(name) LIKE N'%sáng kiến%';

-- Mặc định còn lại là Nghiên cứu khoa học
UPDATE dbo.research_rounds SET round_type_id = 'RT01'
WHERE round_type_id IS NULL;
GO

------------------------------------------------------------------------------
-- 5. Ràng buộc BẮT BUỘC sau khi đã backfill hết
------------------------------------------------------------------------------
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.research_rounds')
      AND name = N'round_type_id' AND is_nullable = 1
)
AND NOT EXISTS (SELECT 1 FROM dbo.research_rounds WHERE round_type_id IS NULL)
BEGIN
    ALTER TABLE dbo.research_rounds ALTER COLUMN round_type_id VARCHAR(6) NOT NULL;
END
GO

------------------------------------------------------------------------------
-- 6. Index phục vụ lọc theo loại đợt
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_rr_round_type')
BEGIN
    CREATE NONCLUSTERED INDEX idx_rr_round_type
        ON dbo.research_rounds (round_type_id);
END
GO

-- @migration 2026-08-28_fix_gen_id_applock_owner.sql
/* ============================================================================
 * Sửa lỗi "Không lấy được khóa sinh mã nhân viên / đề tài, vui lòng thử lại"
 * ----------------------------------------------------------------------------
 * NGUYÊN NHÂN
 *   Trong sp_gen_user_id và sp_gen_topic_id:
 *       DECLARE @owner NVARCHAR(10) = CASE WHEN @@TRANCOUNT > 0
 *                                         THEN N'Transaction' ELSE N'Session' END;
 *   Chuỗi 'Transaction' dài 11 ký tự nhưng biến chỉ NVARCHAR(10) -> bị cắt
 *   âm thầm thành 'Transactio'. Khi proc được gọi BÊN TRONG transaction
 *   (@@TRANCOUNT > 0 — đúng như thiết kế: sinh mã rồi INSERT trong cùng
 *   transaction), sp_getapplock nhận @LockOwner = 'Transactio' (không hợp lệ)
 *   -> trả về giá trị âm -> RAISERROR. Lỗi xảy ra 100% ở nhánh này, không liên
 *   quan tới tranh chấp khóa.
 *
 * CÁCH SỬA
 *   Nới @owner thành NVARCHAR(20). Giữ nguyên toàn bộ logic còn lại.
 *
 * Script idempotent (CREATE OR ALTER), chạy lại nhiều lần an toàn.
 * Yêu cầu: SQL Server 2016 SP1+ (DB hiện ở compatibility level 150).
 * ==========================================================================*/

USE [RMS_HOSPITAL];
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_gen_user_id]
    @dept_code VARCHAR(20), @is_dept_account BIT = 0, @new_id VARCHAR(20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @prefix VARCHAR(12) = 'NV' + @dept_code;

    IF @is_dept_account = 1
    BEGIN
        SET @new_id = @prefix + '0000';
        IF EXISTS (SELECT 1 FROM users WHERE id = @new_id)
            RAISERROR(N'Tài khoản khoa %s đã tồn tại', 16, 1, @dept_code);
        RETURN;
    END

    DECLARE @lock_res NVARCHAR(64) = N'gen_user_id_' + @prefix;
    -- FIX: NVARCHAR(10) -> NVARCHAR(20) (chuỗi 'Transaction' dài 11 ký tự)
    DECLARE @owner NVARCHAR(20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @rc INT;
    EXEC @rc = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive',
                             @LockOwner = @owner, @LockTimeout = 5000;
    IF @rc < 0
    BEGIN
        RAISERROR(N'Không lấy được khóa sinh mã nhân viên, vui lòng thử lại', 16, 1);
        RETURN;
    END

    DECLARE @count INT;
    SELECT @count = ISNULL(MAX(CAST(RIGHT(id,4) AS INT)), 0) + 1
    FROM users
    WHERE id LIKE @prefix + '[0-9][0-9][0-9][0-9]' AND RIGHT(id,4) <> '0000';
    IF @count < 1 SET @count = 1;

    SET @new_id = @prefix + RIGHT('0000' + CAST(@count AS VARCHAR(4)), 4);

    IF @owner = N'Session'
        EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = N'Session';
END;
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_gen_topic_id]
    @category_id VARCHAR(6),
    @round_id    VARCHAR(10),
    @new_id      VARCHAR(15) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @abbr VARCHAR(10);
    SELECT @abbr = abbr FROM dbo.categories WHERE id = @category_id;
    IF @abbr IS NULL
    BEGIN
        RAISERROR(N'Loại đề tài %s không hợp lệ hoặc chưa có ký hiệu viết tắt', 16, 1, @category_id);
        RETURN;
    END

    DECLARE @year INT;
    SELECT @year = year FROM dbo.research_rounds WHERE id = @round_id;
    IF @year IS NULL
    BEGIN
        RAISERROR(N'Đợt nghiên cứu %s không tồn tại', 16, 1, @round_id);
        RETURN;
    END

    DECLARE @prefix VARCHAR(11) = @abbr + '_' + CAST(@year AS VARCHAR(4)) + '_';

    -- Khóa theo prefix: các category/năm khác nhau không chặn nhau
    DECLARE @lock_res NVARCHAR(64) = N'gen_topic_id_' + @prefix;
    -- FIX: NVARCHAR(10) -> NVARCHAR(20) (chuỗi 'Transaction' dài 11 ký tự)
    DECLARE @owner NVARCHAR(20) = CASE WHEN @@TRANCOUNT > 0 THEN N'Transaction' ELSE N'Session' END;
    DECLARE @rc INT;
    EXEC @rc = sp_getapplock @Resource = @lock_res, @LockMode = 'Exclusive',
                             @LockOwner = @owner, @LockTimeout = 5000;
    IF @rc < 0
    BEGIN
        RAISERROR(N'Không lấy được khóa sinh mã đề tài, vui lòng thử lại', 16, 1);
        RETURN;
    END

    -- MAX trên số cuối thay vì COUNT(*): không bị lệch khi có đề tài bị xóa
    DECLARE @next INT;
    SELECT @next = ISNULL(MAX(CAST(RIGHT(id, 3) AS INT)), 0) + 1
    FROM dbo.topics
    WHERE id LIKE @prefix + '[0-9][0-9][0-9]';

    SET @new_id = @prefix + RIGHT('000' + CAST(@next AS VARCHAR(3)), 3);

    IF @owner = N'Session'
        EXEC sp_releaseapplock @Resource = @lock_res, @LockOwner = N'Session';
    -- Nếu owner = Transaction: khóa tự nhả khi COMMIT/ROLLBACK,
    -- đảm bảo không ai chen vào giữa lúc sinh ID và lúc INSERT.
END;
GO

/* --------------------------------------------------------------------------
 * Kiểm tra nhanh sau khi chạy migration:
 *
 *   BEGIN TRAN;
 *   DECLARE @id VARCHAR(20);
 *   EXEC sp_gen_user_id @dept_code = 'KNA', @is_dept_account = 0, @new_id = @id OUTPUT;
 *   SELECT @id;               -- phải ra mã dạng NVKNA0001, KHÔNG còn RAISERROR
 *   ROLLBACK;
 * ------------------------------------------------------------------------*/

-- @migration 2026-08-28_role_based_authz.sql
/* ============================================================================
 * Chuyển phân quyền từ users.account_type sang Vai trò / Quyền (role_permissions)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Hệ thống có 2 trục phân quyền song song: users.account_type (admin/director/
 *   reviewer/manager/dept/member) và users.role_id -> role_permissions. account_type
 *   bỏ qua toàn bộ ma trận quyền (superuser), khiến vai trò gán cho tài khoản admin
 *   trở nên vô nghĩa. Migration này bỏ hẳn account_type; mọi quyết định phân quyền
 *   suy ra từ role_id + tập quyền của vai trò. Thêm 9 quyền "meta" thay cho những
 *   gì account_type từng mã hoá.
 *
 * ÁNH XẠ BACKFILL role_id THEO account_type CŨ
 *   admin->VT01  director->VT02  manager->VT03  reviewer->VT04  dept->VT07  member->VT06
 *
 * CẢNH BÁO
 *   - Bước 6 DROP COLUMN users.account_type — KHÔNG revert được. BACKUP DB trước khi chạy.
 *   - Script idempotent, chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL]
GO

------------------------------------------------------------------------------
-- 1. Thêm quyền mới
--    - 9 quyền "meta" thay cho những gì account_type từng mã hoá
--    - resource 'councils' (Hội đồng chấm) — route đã yêu cầu nhưng CHƯA có
--      permission nào, nên trước đây chỉ superuser dùng được.
------------------------------------------------------------------------------
MERGE [dbo].[permissions] AS tgt
USING (VALUES
    ('PERM-SYS-MANAGE',     N'Toàn quyền hệ thống',        N'Superuser — bỏ qua mọi kiểm tra phân quyền',            'system',        'manage'),
    ('PERM-PANEL-ACCESS',   N'Truy cập trang quản trị',    N'Được vào khu vực /admin',                               'admin_panel',   'access'),
    ('PERM-TOP-READ-ALL',   N'Xem tất cả đề tài',          N'Xem mọi đề tài trong hệ thống',                         'topics',        'read_all'),
    ('PERM-TOP-READ-DEPT',  N'Xem đề tài trong khoa',      N'Chỉ xem đề tài thuộc khoa của mình',                    'topics',        'read_department'),
    ('PERM-USR-READ-ALL',   N'Xem tất cả tài khoản',       N'Xem mọi tài khoản người dùng',                          'users',         'read_all'),
    ('PERM-USR-READ-DEPT',  N'Xem tài khoản trong khoa',   N'Chỉ xem / sửa tài khoản thuộc khoa của mình',           'users',         'read_department'),
    ('PERM-ACTLOG-READ',    N'Xem nhật ký hoạt động',      N'Truy cập nhật ký hoạt động hệ thống',                   'activity_logs', 'read'),
    ('PERM-NOTIF-MANAGE',   N'Quản lý thông báo hệ thống', N'Gửi và xoá thông báo toàn hệ thống',                    'notifications', 'manage'),
    ('PERM-CAT-MANAGE',     N'Quản lý danh mục hệ thống',  N'Tạo / sửa / xoá phân loại, cấp độ, loại đợt nghiên cứu','catalog',       'manage'),
    ('PERM-CNL-READ',       N'Xem hội đồng',               N'Xem hội đồng chấm và người ngoài viện',                 'councils',      'read'),
    ('PERM-CNL-CREATE',     N'Tạo hội đồng',               N'Tạo hội đồng chấm, thêm người ngoài viện',              'councils',      'create'),
    ('PERM-CNL-UPDATE',     N'Cập nhật hội đồng',          N'Sửa thành viên / thông tin hội đồng',                   'councils',      'update'),
    ('PERM-CNL-DELETE',     N'Xoá hội đồng',               N'Xoá hội đồng chấm khỏi hệ thống',                       'councils',      'delete'),
    ('PERM-CNL-MANAGE',     N'Toàn quyền hội đồng',        N'Toàn quyền quản lý hội đồng chấm',                      'councils',      'manage')
) AS src (id, name, description, resource, action)
ON tgt.id = src.id
WHEN NOT MATCHED THEN
    INSERT (id, name, description, sort_order, resource, action)
    VALUES (src.id, src.name, src.description, 90, src.resource, src.action);
GO

------------------------------------------------------------------------------
-- 2. Gán quyền cho vai trò — bộ quyền đầy đủ, khớp với chức năng hiện có.
--    Bảng users/roles đã có sẵn ~90 dòng cơ bản; INSERT ... WHERE NOT EXISTS
--    chỉ bổ sung phần còn thiếu (idempotent).
--
--    VT01 admin      : toàn bộ quyền
--    VT02 giam_doc   : giám sát + duyệt đề tài, xem toàn hệ thống, trang quản trị
--    VT03 quan_ly_nckh: điều hành NCKH — đợt / đề tài / hội đồng / danh mục
--    VT04 hoi_dong   : xem toàn bộ đề tài + duyệt, xem hội đồng của mình
--    VT05 chu_nhiem  : tạo & sửa đề tài của mình, nộp tài liệu
--    VT06 thanh_vien : xem đề tài tham gia, nộp tài liệu
--    VT07 truong_khoa: xem toàn bộ đề tài, quản lý tài khoản trong khoa
------------------------------------------------------------------------------
;WITH pairs (role_id, permission_id) AS (
    -- VT01: mọi quyền
    SELECT 'VT01', id FROM [dbo].[permissions]

    -- VT02 — Giám đốc / Lãnh đạo
    UNION ALL SELECT 'VT02', v FROM (VALUES
        ('PERM-PANEL-ACCESS'),('PERM-ACTLOG-READ'),
        ('PERM-TOP-READ'),('PERM-TOP-READ-ALL'),('PERM-TOP-APPROVE'),
        ('PERM-USR-READ'),('PERM-USR-READ-ALL'),
        ('PERM-DEPT-READ'),('PERM-RND-READ'),('PERM-CNL-READ'),('PERM-ROLE-READ'),
        ('PERM-FILE-READ'),('PERM-FILE-CREATE'),
        ('PERM-RPT-READ'),('PERM-RPT-CREATE')) x(v)

    -- VT03 — Cán bộ NCKH (điều hành quy trình)
    UNION ALL SELECT 'VT03', v FROM (VALUES
        ('PERM-PANEL-ACCESS'),('PERM-ACTLOG-READ'),('PERM-NOTIF-MANAGE'),('PERM-CAT-MANAGE'),
        ('PERM-TOP-READ'),('PERM-TOP-READ-ALL'),('PERM-TOP-CREATE'),('PERM-TOP-UPDATE'),('PERM-TOP-DELETE'),
        ('PERM-USR-READ'),('PERM-USR-READ-ALL'),('PERM-USR-CREATE'),('PERM-USR-UPDATE'),
        ('PERM-DEPT-READ'),('PERM-DEPT-UPDATE'),
        ('PERM-RND-READ'),('PERM-RND-CREATE'),('PERM-RND-UPDATE'),('PERM-RND-DELETE'),('PERM-RND-MANAGE'),
        ('PERM-CNL-READ'),('PERM-CNL-CREATE'),('PERM-CNL-UPDATE'),('PERM-CNL-DELETE'),('PERM-CNL-MANAGE'),
        ('PERM-FILE-READ'),('PERM-FILE-CREATE'),('PERM-FILE-UPDATE'),('PERM-FILE-DELETE'),
        ('PERM-RPT-READ'),('PERM-RPT-CREATE'),('PERM-RPT-UPDATE'),
        ('PERM-ROLE-READ')) x(v)

    -- VT04 — Hội đồng xét duyệt
    UNION ALL SELECT 'VT04', v FROM (VALUES
        ('PERM-TOP-READ'),('PERM-TOP-READ-ALL'),('PERM-TOP-APPROVE'),
        ('PERM-DEPT-READ'),('PERM-RND-READ'),('PERM-CNL-READ'),
        ('PERM-FILE-READ'),('PERM-RPT-READ')) x(v)

    -- VT05 — Chủ nhiệm đề tài
    UNION ALL SELECT 'VT05', v FROM (VALUES
        ('PERM-TOP-READ'),('PERM-TOP-CREATE'),('PERM-TOP-UPDATE'),
        ('PERM-DEPT-READ'),('PERM-RND-READ'),
        ('PERM-FILE-READ'),('PERM-FILE-CREATE'),('PERM-FILE-UPDATE')) x(v)

    -- VT06 — Thành viên đề tài
    UNION ALL SELECT 'VT06', v FROM (VALUES
        ('PERM-TOP-READ'),('PERM-DEPT-READ'),('PERM-RND-READ'),
        ('PERM-FILE-READ'),('PERM-FILE-CREATE')) x(v)

    -- VT07 — Trưởng khoa / phòng (kiêm tài khoản khoa dùng chung)
    UNION ALL SELECT 'VT07', v FROM (VALUES
        ('PERM-TOP-READ'),('PERM-TOP-READ-ALL'),
        ('PERM-USR-READ'),('PERM-USR-READ-DEPT'),
        ('PERM-DEPT-READ'),('PERM-RND-READ'),('PERM-CNL-READ'),
        ('PERM-FILE-READ'),('PERM-FILE-CREATE'),('PERM-RPT-READ')) x(v)
)
INSERT INTO [dbo].[role_permissions] (role_id, permission_id, created_by)
SELECT p.role_id, p.permission_id, 'SYSTEM'
FROM pairs p
WHERE EXISTS (SELECT 1 FROM [dbo].[permissions] pm WHERE pm.id = p.permission_id)
  AND NOT EXISTS (
    SELECT 1 FROM [dbo].[role_permissions] rp
    WHERE rp.role_id = p.role_id AND rp.permission_id = p.permission_id
  );
GO

------------------------------------------------------------------------------
-- 3. Backfill role_id từ account_type cũ (chỉ khi cột còn tồn tại)
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.users', N'account_type') IS NOT NULL
BEGIN
    EXEC('
        UPDATE [dbo].[users]
        SET role_id = CASE account_type
            WHEN ''admin''    THEN ''VT01''
            WHEN ''director'' THEN ''VT02''
            WHEN ''manager''  THEN ''VT03''
            WHEN ''reviewer'' THEN ''VT04''
            WHEN ''dept''     THEN ''VT07''
            WHEN ''member''   THEN ''VT06''
            ELSE role_id END
        WHERE account_type IS NOT NULL;');
END
GO

------------------------------------------------------------------------------
-- 4. Vá các đối tượng DB đang tham chiếu account_type
------------------------------------------------------------------------------

-- 4a. Trigger audit: bỏ dòng so sánh account_type
CREATE OR ALTER TRIGGER [dbo].[trg_users_audit]
ON [dbo].[users]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor VARCHAR(20) = CAST(SESSION_CONTEXT(N'current_user_id') AS VARCHAR(20));

    UPDATE u
    SET updated_at = GETDATE(),
        updated_by = @actor
    FROM users u
    INNER JOIN inserted i ON u.id = i.id
    INNER JOIN deleted  d ON u.id = d.id
    WHERE
        i.username      <> d.username      OR
        i.password      <> d.password      OR
        i.full_name     <> d.full_name     OR
        ISNULL(i.email,'')           <> ISNULL(d.email,'')           OR
        ISNULL(i.department_id,'')   <> ISNULL(d.department_id,'')   OR
        ISNULL(i.role_id,'')         <> ISNULL(d.role_id,'')         OR
        i.is_active     <> d.is_active     OR
        ISNULL(i.topic_member_id,'') <> ISNULL(d.topic_member_id,'');
END;
GO
-- Giữ trạng thái disabled như bản gốc
ALTER TABLE [dbo].[users] DISABLE TRIGGER [trg_users_audit];
GO

-- 4b. sp_deactivate_expired_accounts: 'member' -> vai trò VT06
CREATE OR ALTER PROCEDURE [dbo].[sp_deactivate_expired_accounts]
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE users
    SET is_active  = 0,
        updated_at = GETDATE()
    WHERE is_active        = 1
      AND role_id          = 'VT06'           -- chỉ TK thành viên (tạm thời)
      AND account_expires_at IS NOT NULL
      AND account_expires_at < CAST(GETDATE() AS DATE);

    SELECT @@ROWCOUNT AS deactivated_count;
END;
GO

-- 4c. sp_resolve_recipients: loại tài khoản khoa dùng chung = role_id 'VT07'
CREATE OR ALTER PROCEDURE [dbo].[sp_resolve_recipients]
    @user_ids               NVARCHAR(MAX) = NULL,
    @role_ids               NVARCHAR(MAX) = NULL,
    @department_ids          NVARCHAR(MAX) = NULL,
    @include_dept_accounts   BIT           = 0,
    @topic_id               VARCHAR(15)   = NULL,
    @topic_member_roles     NVARCHAR(MAX) = NULL,
    @all_active             BIT           = 0,
    @resolved_ids           NVARCHAR(MAX) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ids TABLE (user_id VARCHAR(20) PRIMARY KEY);

    IF @user_ids IS NOT NULL AND @user_ids <> '[]'
        INSERT INTO @ids (user_id)
        SELECT DISTINCT [value]
        FROM OPENJSON(@user_ids)
        WHERE [value] NOT IN (SELECT user_id FROM @ids);

    IF @role_ids IS NOT NULL AND @role_ids <> '[]'
        INSERT INTO @ids (user_id)
        SELECT DISTINCT u.id
        FROM users u
        WHERE u.is_active = 1
            AND u.role_id IN (SELECT [value] FROM OPENJSON(@role_ids))
            AND u.id NOT IN (SELECT user_id FROM @ids);

    -- department_ids (+ include_dept_accounts): mặc định loại tài khoản khoa
    -- dùng chung (vai trò VT07), trừ khi bật cờ.
    IF @department_ids IS NOT NULL AND @department_ids <> '[]'
        INSERT INTO @ids (user_id)
        SELECT DISTINCT u.id
        FROM users u
        WHERE u.is_active = 1
            AND u.department_id IN (SELECT [value] FROM OPENJSON(@department_ids))
            AND (@include_dept_accounts = 1 OR u.role_id <> 'VT07')
            AND u.id NOT IN (SELECT user_id FROM @ids);

    IF @topic_id IS NOT NULL
    BEGIN
        INSERT INTO @ids (user_id)
        SELECT DISTINCT t.created_by
        FROM topics t
        WHERE t.id = @topic_id
            AND t.created_by IS NOT NULL
            AND (@topic_member_roles IS NULL OR @topic_member_roles = '[]')
            AND t.created_by NOT IN (SELECT user_id FROM @ids);

        INSERT INTO @ids (user_id)
        SELECT DISTINCT tm.user_id
        FROM topic_members tm
        WHERE tm.topic_id = @topic_id
            AND tm.user_id IS NOT NULL
            AND tm.account_granted = 1
            AND (
                @topic_member_roles IS NULL OR @topic_member_roles = '[]'
                OR tm.role IN (SELECT [value] FROM OPENJSON(@topic_member_roles))
            )
            AND tm.user_id NOT IN (SELECT user_id FROM @ids);
    END

    IF @all_active = 1
        INSERT INTO @ids (user_id)
        SELECT DISTINCT u.id
        FROM users u
        WHERE u.is_active = 1
            AND u.id NOT IN (SELECT user_id FROM @ids);

    SELECT @resolved_ids = '[' + STRING_AGG('"' + user_id + '"', ',') + ']'
    FROM @ids;

    SET @resolved_ids = ISNULL(@resolved_ids, '[]');
END;
GO

-- 4d. sp_grant_member_accounts: bỏ cột account_type khỏi INSERT users
CREATE OR ALTER PROCEDURE [dbo].[sp_grant_member_accounts]
    @topic_id   VARCHAR(15),
    @actor_id   VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    EXEC sp_set_session_context N'current_user_id', @actor_id;

    IF NOT EXISTS (SELECT 1 FROM [dbo].[topics] WHERE [id] = @topic_id)
    BEGIN
        RAISERROR(N'Đề tài %s không tồn tại', 16, 1, @topic_id);
        RETURN;
    END

    DECLARE @new_expires DATE;
    SELECT @new_expires = rr.[end_date]
    FROM   [dbo].[topics] t
    JOIN   [dbo].[research_rounds] rr ON rr.[id] = t.[round_id]
    WHERE  t.[id] = @topic_id;

    DECLARE @topic_dept_id   VARCHAR(20),
            @topic_dept_code VARCHAR(20);
    SELECT @topic_dept_id   = t.[department_id],
           @topic_dept_code = d.[code]
    FROM   [dbo].[topics] t
    JOIN   [dbo].[departments] d ON d.[id] = t.[department_id]
    WHERE  t.[id] = @topic_id;

    DECLARE @newly_granted TABLE ([user_id] VARCHAR(20), [is_new_account] BIT);

    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @member_id    VARCHAR(22),
                @name         NVARCHAR(255),
                @email        VARCHAR(255),
                @staff_number VARCHAR(50),
                @member_dept  VARCHAR(20),
                @dept_id      VARCHAR(20),
                @dept_code    VARCHAR(20),
                @new_uid      VARCHAR(20),
                @new_uname    VARCHAR(100),
                @exist_uid    VARCHAR(20);

        DECLARE mc CURSOR FOR
            SELECT [id], [name], [email], [staff_number], [department_id]
            FROM   [dbo].[topic_members]
            WHERE  [topic_id]       = @topic_id
              AND  [account_granted] = 0
              AND  [email]           IS NOT NULL;

        OPEN mc;
        FETCH NEXT FROM mc INTO @member_id, @name, @email, @staff_number, @member_dept;

        WHILE @@FETCH_STATUS = 0
        BEGIN
            SELECT @dept_id = COALESCE(
                (SELECT [department_id] FROM [dbo].[users] WHERE [staff_number] = @staff_number),
                @member_dept,
                @topic_dept_id
            );
            SELECT @dept_code = ISNULL(
                (SELECT [code] FROM [dbo].[departments] WHERE [id] = @dept_id),
                @topic_dept_code
            );

            SET @exist_uid = NULL;
            SELECT @exist_uid = [id] FROM [dbo].[users] WHERE [email] = @email;

            IF @exist_uid IS NOT NULL
            BEGIN
                UPDATE [dbo].[users]
                SET    [is_active]          = 1,
                       [account_expires_at] = @new_expires,
                       [updated_at]         = GETDATE(),
                       [updated_by]         = @actor_id
                WHERE  [id] = @exist_uid;

                UPDATE [dbo].[topic_members]
                SET    [user_id]            = @exist_uid,
                       [account_granted]    = 1,
                       [account_granted_at] = GETDATE()
                WHERE  [id] = @member_id;

                INSERT INTO @newly_granted VALUES (@exist_uid, 0);
            END
            ELSE
            BEGIN
                EXEC [dbo].[sp_gen_user_id] @dept_code, 0, @new_uid OUTPUT;

                SET @new_uname = LEFT(@email, CHARINDEX('@', @email) - 1);
                IF EXISTS (SELECT 1 FROM [dbo].[users] WHERE [username] = @new_uname)
                    SET @new_uname = @new_uname + '_' + RIGHT(@new_uid, 4);

                INSERT INTO [dbo].[users]
                    ([id], [username], [password], [full_name], [email],
                     [department_id], [role_id],
                     [account_expires_at], [topic_member_id], [created_by])
                VALUES
                    (@new_uid, @new_uname, '$2b$12$TEMP_MUST_CHANGE',
                     @name, @email,
                     @dept_id, 'VT06',
                     @new_expires, @member_id, @actor_id);

                UPDATE [dbo].[topic_members]
                SET    [user_id]            = @new_uid,
                       [account_granted]    = 1,
                       [account_granted_at] = GETDATE()
                WHERE  [id] = @member_id;

                INSERT INTO @newly_granted VALUES (@new_uid, 1);
            END

            FETCH NEXT FROM mc INTO @member_id, @name, @email, @staff_number, @member_dept;
        END
        CLOSE mc; DEALLOCATE mc;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF CURSOR_STATUS('local', 'mc') >= 0 BEGIN CLOSE mc; DEALLOCATE mc; END
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH

    DECLARE @uid       VARCHAR(20),
            @is_new    BIT,
            @uid_json  NVARCHAR(MAX);

    DECLARE nc CURSOR LOCAL FAST_FORWARD FOR
        SELECT [user_id], [is_new_account] FROM @newly_granted;

    OPEN nc;
    FETCH NEXT FROM nc INTO @uid, @is_new;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @uid_json = '["' + @uid + '"]';

        DECLARE @account_msg NVARCHAR(MAX);
        IF @is_new = 1
            SET @account_msg = N'Tài khoản đã được cấp để tham gia đề tài NCKH. Vui lòng đăng nhập với mật khẩu mặc định (123456) và đổi mật khẩu ngay.';
        ELSE
            SET @account_msg = N'Tài khoản của bạn đã được kích hoạt lại để tham gia đề tài NCKH. Bạn có thể đăng nhập ngay với mật khẩu hiện tại.';

        DECLARE @account_title NVARCHAR(255);
        IF @is_new = 1
            SET @account_title = N'Tài khoản hệ thống đã được cấp';
        ELSE
            SET @account_title = N'Tài khoản đã được kích hoạt lại';

        EXEC [dbo].[sp_push_notification]
            @type     = 'account_granted',
            @title    = @account_title,
            @message  = @account_msg,
            @ref_id   = @topic_id,
            @ref_type = 'topic',
            @user_ids = @uid_json;

        FETCH NEXT FROM nc INTO @uid, @is_new;
    END
    CLOSE nc; DEALLOCATE nc;

    SELECT u.[id], u.[username], u.[full_name], u.[email], tm.[role]
    FROM   [dbo].[users] u
    JOIN   [dbo].[topic_members] tm ON tm.[user_id] = u.[id]
    JOIN   @newly_granted ng         ON ng.[user_id] = u.[id]
    WHERE  tm.[topic_id] = @topic_id;
END;
GO

------------------------------------------------------------------------------
-- 5. Gỡ ràng buộc / index phụ thuộc cột account_type
------------------------------------------------------------------------------

-- 5a. CHECK constraint
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_user_actype')
    ALTER TABLE [dbo].[users] DROP CONSTRAINT [CHK_user_actype];
GO

-- 5b. DEFAULT constraint (tên tự sinh)
DECLARE @df sysname;
SELECT @df = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID(N'dbo.users') AND c.name = N'account_type';
IF @df IS NOT NULL EXEC('ALTER TABLE [dbo].[users] DROP CONSTRAINT [' + @df + ']');
GO

-- 5c. Index chỉ trên account_type: bỏ hẳn
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_users_type' AND object_id = OBJECT_ID(N'dbo.users'))
    DROP INDEX [idx_users_type] ON [dbo].[users];
GO

-- 5d. Index có INCLUDE account_type: bỏ để tạo lại sau khi drop cột
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_users_username_active' AND object_id = OBJECT_ID(N'dbo.users'))
    DROP INDEX [idx_users_username_active] ON [dbo].[users];
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_users_created_at_desc' AND object_id = OBJECT_ID(N'dbo.users'))
    DROP INDEX [IX_users_created_at_desc] ON [dbo].[users];
GO

------------------------------------------------------------------------------
-- 6. Bỏ cột account_type
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.users', N'account_type') IS NOT NULL
    ALTER TABLE [dbo].[users] DROP COLUMN [account_type];
GO

------------------------------------------------------------------------------
-- 7. Tạo lại các index (không còn account_type)
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_users_username_active' AND object_id = OBJECT_ID(N'dbo.users'))
    CREATE NONCLUSTERED INDEX [idx_users_username_active] ON [dbo].[users] ([username] ASC)
        INCLUDE ([id],[password],[full_name],[role_id],[is_active],[department_id],[account_expires_at])
        WHERE ([is_active] = (1));
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_users_created_at_desc' AND object_id = OBJECT_ID(N'dbo.users'))
    CREATE NONCLUSTERED INDEX [IX_users_created_at_desc] ON [dbo].[users] ([created_at] DESC)
        INCLUDE (username, staff_number, full_name, email,
                 is_active, department_id, role_id,
                 can_sit_council, can_chair_council,
                 password_changed_at, updated_at);
GO

UPDATE STATISTICS [dbo].[users];
GO

/* --------------------------------------------------------------------------
 * KIỂM TRA SAU KHI CHẠY
 *   SELECT COUNT(*) FROM sys.columns
 *   WHERE object_id = OBJECT_ID('dbo.users') AND name = 'account_type';   -- = 0
 *
 *   SELECT r.id, r.name,
 *          (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id)          AS user_count,
 *          (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS perm_count
 *   FROM roles r ORDER BY r.id;
 *   -- VT01 user_count >= 2 (bgd + admin); VT01 perm_count = tổng số quyền
 *
 *   -- Quyền của một vai trò (đọc dạng resource:action):
 *   SELECT p.resource + ':' + p.action
 *   FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
 *   WHERE rp.role_id = 'VT03' ORDER BY 1;
 * ------------------------------------------------------------------------*/

-- @migration 2026-08-29_users_list_perf.sql
/* ============================================================================
 * Tăng tốc màn "Quản lý người dùng" (GET /api/v1/users) và ô tìm thành viên
 * (GET /api/v1/users/search)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   userService.getAll trả về danh sách phân trang + thống kê. Câu list sắp xếp
 *   theo u.created_at DESC nhưng KHÔNG có index cho cột này -> mỗi lần mở trang
 *   / chuyển trang SQL Server phải Sort toàn bộ bảng users (~1.6k dòng) rồi mới
 *   OFFSET/FETCH. searchForMember sắp xếp theo u.full_name cũng không có index.
 *
 * THAY ĐỔI (chỉ thêm index, không đụng dữ liệu — an toàn, idempotent)
 *   1. IX_users_created_at_desc  : phủ (covering) đúng các cột câu list cần ->
 *      câu list trở thành "đọc TOP N theo index", bỏ hẳn toán tử Sort.
 *   2. IX_users_active_fullname  : filtered (is_active = 1) + sắp theo full_name
 *      -> phục vụ searchForMember (luôn lọc is_active = 1, ORDER BY full_name).
 *
 * Chạy lại nhiều lần an toàn. Tạo index ONLINE = OFF (SQL Server Express không
 * hỗ trợ ONLINE); bảng nhỏ nên thời gian khoá không đáng kể.
 * ==========================================================================*/

------------------------------------------------------------------------------
-- 1. Index phủ cho câu danh sách (sắp xếp mặc định created_at DESC)
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_users_created_at_desc'
                                           AND object_id = OBJECT_ID(N'dbo.users'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_users_created_at_desc
        ON dbo.users (created_at DESC)
        INCLUDE (username, staff_number, full_name, email, account_type,
                 is_active, department_id, role_id,
                 can_sit_council, can_chair_council,
                 password_changed_at, updated_at);
END
GO

------------------------------------------------------------------------------
-- 2. Index cho ô tìm thành viên: WHERE is_active = 1 ... ORDER BY full_name
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_users_active_fullname'
                                           AND object_id = OBJECT_ID(N'dbo.users'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_users_active_fullname
        ON dbo.users (full_name)
        INCLUDE (username, staff_number, email, department_id)
        WHERE is_active = 1;
END
GO

------------------------------------------------------------------------------
-- 3. Cập nhật thống kê để optimizer chọn plan mới ngay
------------------------------------------------------------------------------
UPDATE STATISTICS dbo.users;
GO

/* --------------------------------------------------------------------------
 * Kiểm tra nhanh sau khi chạy:
 *   SET STATISTICS IO, TIME ON;
 *   SELECT TOP 20 id, full_name, created_at
 *   FROM users ORDER BY created_at DESC;      -- plan phải là Index Scan
 *                                             -- trên IX_users_created_at_desc,
 *                                             -- KHÔNG còn Sort
 * ------------------------------------------------------------------------*/

-- @migration 2026-08-30_deadline_types.sql
/* ============================================================================
 * Rút gọn loại mốc thời gian (round_deadlines.deadline_type) còn 3 loại
 * ----------------------------------------------------------------------------
 *   edit               — "Sửa"        : chủ nhiệm/thư ký sửa toàn bộ đề tài
 *   supplement         — "Bổ sung"    : chỉ sửa những mục đã cấu hình
 *   report_submission  — "Nộp báo cáo": chỉ tải lên file mới
 *
 * - Thêm cột supplement_fields (danh sách mục được sửa, phân tách bằng dấu phẩy).
 * - Đổi 'registration' -> 'edit'; dồn 'council_submission' -> 'report_submission'.
 * - Cập nhật CHECK constraint CHK_rd_type.
 * Script idempotent, chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL]
GO

------------------------------------------------------------------------------
-- 1. Cột supplement_fields
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.round_deadlines', N'supplement_fields') IS NULL
BEGIN
    ALTER TABLE dbo.round_deadlines ADD supplement_fields VARCHAR(120) NULL;
END
GO

------------------------------------------------------------------------------
-- 2. Gỡ CHECK cũ để có thể đổi dữ liệu
------------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_rd_type')
    ALTER TABLE dbo.round_deadlines DROP CONSTRAINT CHK_rd_type;
GO

------------------------------------------------------------------------------
-- 3. Chuyển dữ liệu hiện có
------------------------------------------------------------------------------
UPDATE dbo.round_deadlines SET deadline_type = 'edit'
WHERE deadline_type = 'registration';

-- Không còn dùng 'council_submission' — gộp về 'report_submission'
UPDATE dbo.round_deadlines SET deadline_type = 'report_submission'
WHERE deadline_type = 'council_submission';

-- Bản ghi lạ khác (nếu có) đưa về 'edit' cho an toàn
UPDATE dbo.round_deadlines SET deadline_type = 'edit'
WHERE deadline_type NOT IN ('edit', 'supplement', 'report_submission');

-- supplement_fields chỉ có ý nghĩa với loại 'supplement'
UPDATE dbo.round_deadlines SET supplement_fields = NULL
WHERE deadline_type <> 'supplement';
GO

------------------------------------------------------------------------------
-- 4. CHECK constraint mới
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_rd_type')
BEGIN
    ALTER TABLE dbo.round_deadlines WITH CHECK
        ADD CONSTRAINT CHK_rd_type CHECK
        (deadline_type IN ('edit', 'supplement', 'report_submission'));
END
GO

------------------------------------------------------------------------------
-- 5. LƯU Ý THỦ CÔNG
------------------------------------------------------------------------------
-- Proc [dbo].[sp_process_daily_deadlines] còn tham chiếu chuỗi 'registration' /
-- 'council_submission' trong khối ghi deadline_actions 'auto_close'. Đây chỉ là
-- bản ghi kiểm toán, không ảnh hưởng chức năng nhắc hạn (chạy theo deadline_date).
-- Khi tiện, sửa danh sách IN của proc thành:
--   ('edit', 'supplement', 'report_submission')
PRINT N'>> Nhớ cập nhật danh sách deadline_type trong sp_process_daily_deadlines.';
GO
