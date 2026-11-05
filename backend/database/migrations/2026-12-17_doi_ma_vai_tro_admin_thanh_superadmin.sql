/* ============================================================================
 * 2026-12-17_doi_ma_vai_tro_admin_thanh_superadmin
 * ----------------------------------------------------------------------------
 *   Tách 2 vai trò quản trị (database/seed/system-roles.json):
 *     superadmin — toàn quyền (roles.is_superuser), trước đây mang mã "admin"
 *     admin      — vai trò MỚI, không toàn quyền: chỉ NCKH, đào tạo / CME, người dùng
 *   File này chỉ đổi mã của vai trò toàn quyền cũ "admin" → "superadmin" để mã
 *   "admin" dành cho vai trò mới. Giữ nguyên tên hiển thị, quyền và tài khoản đang
 *   gán. Vai trò Admin mới do `npm run init:system` tạo (cần danh mục quyền đã đồng bộ).
 *   Mã vai trò chỉ dùng để tra id (modules/access/roleCodes.js), không có code nào
 *   kiểm tra mã "admin" ⇒ code cũ chạy với DB mới vẫn đúng.
 * Idempotent: đã có "superadmin" hoặc không còn "admin" toàn quyền thì không đổi gì.
 * ==========================================================================*/

UPDATE roles
SET code = 'superadmin'
WHERE code = 'admin'
  AND is_superuser
  AND NOT EXISTS (SELECT 1 FROM roles WHERE code = 'superadmin');
