/* ============================================================================
 * 2026-11-05_retire_training_plans_permission
 * ----------------------------------------------------------------------------
 *   Bỏ tính năng "Kế hoạch đào tạo" (trang /admin/training-plans + API
 *   /training-plans) — không dùng tới. Chỉ gỡ quyền training_plans:manage và
 *   các lượt cấp quyền đó cho vai trò; server không còn tự xoá quyền thừa
 *   (permissions/sync.js chỉ cảnh báo), nên phải gỡ ở đây.
 *
 *   GIỮ NGUYÊN bảng training_plans, training_plan_items và cột
 *   courses.plan_item_id: code không còn đọc/ghi, nhưng dữ liệu cũ vẫn còn
 *   nếu cần tra lại. Muốn xoá hẳn thì viết migration riêng (DROP cột + FK
 *   FK_courses_plan_item + IX_courses_plan_item trước, rồi tới 2 bảng).
 *
 * Idempotent — chạy lại an toàn.
 * ==========================================================================*/

BEGIN TRANSACTION;

DELETE FROM dbo.role_permissions WHERE permission_id = 'PERM-TRNPLAN-MANAGE';
PRINT N'Đã gỡ ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' lượt cấp quyền training_plans:manage';

DELETE FROM dbo.permissions WHERE id = 'PERM-TRNPLAN-MANAGE';
PRINT N'Đã xoá ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' quyền training_plans:manage';

COMMIT TRANSACTION;
GO
