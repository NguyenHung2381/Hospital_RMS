/* ============================================================================
 * 2026-12-01_lock_inactive_trainee_accounts
 * ----------------------------------------------------------------------------
 *   Trước đây xoá (hidden_at) hoặc ngừng (is_active = 0) hồ sơ học viên KHÔNG
 *   khoá tài khoản học viên đi kèm ⇒ vẫn đăng nhập được cổng học viên. Nay
 *   traineeService.remove/update khoá tài khoản; migration này khoá bù các tài
 *   khoản của hồ sơ đã xoá / ngừng từ trước.
 *   Chỉ đụng tài khoản vai trò Học viên (trainees.user_id), không đụng tài khoản
 *   nội viện (trainees.staff_user_id).
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

UPDATE u
SET u.is_active = 0,
    u.updated_at = GETDATE()
FROM [dbo].[users] u
JOIN [dbo].[trainees] t ON t.user_id = u.id
JOIN [dbo].[roles] r ON r.id = u.role_id AND r.code = 'trainee'
WHERE u.is_active = 1
  AND (t.hidden_at IS NOT NULL OR ISNULL(t.is_active, 1) = 0);
GO
