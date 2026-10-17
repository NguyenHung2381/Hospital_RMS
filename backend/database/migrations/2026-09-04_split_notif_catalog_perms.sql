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
