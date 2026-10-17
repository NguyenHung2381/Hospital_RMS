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
