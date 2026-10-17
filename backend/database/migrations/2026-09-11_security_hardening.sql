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
