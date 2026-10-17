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
