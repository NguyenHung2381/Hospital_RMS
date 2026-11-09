/* ============================================================================
 * 2026-12-20_ly_do_khoa_tai_khoan
 * ----------------------------------------------------------------------------
 *   Rà soát bảo mật run-4, lỗi L-08: cấp tài khoản thành viên đề tài
 *   (topicMemberService.grantAccounts) mở lại tài khoản "đang khóa và đã quá hạn"
 *   — nhưng khóa do job hết hạn và khóa tay của quản trị trông giống hệt nhau, nên
 *   chủ nhiệm đề tài (không có users:update) mở lại được tài khoản quản trị đã khóa.
 *
 *   Thêm users.deactivated_reason: lý do khóa gần nhất.
 *     'expired' — job accountMaintenanceJob khóa vì quá hạn (duy nhất giá trị mà luồng
 *                 cấp tài khoản được phép mở lại);
 *     NULL      — còn hoạt động, hoặc khóa vì lý do khác (khóa tay của quản trị…) —
 *                 chỉ quản trị mở lại được.
 *
 *   Backfill: chỉ tài khoản vai trò 'member' đang khóa và đã quá hạn — đúng tập job
 *   hết hạn khóa (job không bao giờ khóa vai trò khác). Có thể lẫn vài tài khoản
 *   quản trị khóa tay từ trước khi có cột này; không phân biệt được sau sự việc.
 *   Tài khoản vai trò khác giữ NULL ⇒ cần quản trị mở lại.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_reason varchar(20);

UPDATE users
SET deactivated_reason = 'expired'
WHERE deactivated_reason IS NULL
  AND is_active = false
  AND account_expires_at IS NOT NULL
  AND account_expires_at < CAST((now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AS DATE)
  AND role_id IN (SELECT id FROM roles WHERE code = 'member');
