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
