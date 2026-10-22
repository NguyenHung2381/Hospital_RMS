/* ============================================================================
 * 2026-11-29_trainee_separate_accounts
 * ----------------------------------------------------------------------------
 *   Tài khoản học viên CẤP RIÊNG, không gộp vào tài khoản nội viện.
 *   Trước đây ghi danh nhân viên vào khóa (courseEnrollmentService.registerStaff)
 *   gắn thẳng trainees.user_id = tài khoản nhân viên ⇒ nhân viên học bằng chính
 *   tài khoản nội viện. Nay:
 *   - trainees.user_id      : CHỈ là tài khoản học viên (vai trò Học viên, mã 'HV…')
 *                             do "Cấp tài khoản học viên" sinh ra.
 *   - trainees.staff_user_id: tài khoản nội viện mà hồ sơ học viên được tạo từ đó
 *                             (học viên là nhân viên BV) — chỉ để liên kết/chống
 *                             tạo trùng hồ sơ, KHÔNG dùng để đăng nhập học.
 * 1) Thêm cột staff_user_id (+ FK, index lọc).
 * 2) Chuyển các liên kết cũ trỏ vào tài khoản KHÔNG phải vai trò Học viên sang
 *    staff_user_id; user_id/account_granted về chưa cấp — phòng Đào tạo cấp tài
 *    khoản học viên riêng cho các hồ sơ này ở mục Học viên.
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.trainees', 'staff_user_id') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [staff_user_id] VARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_trainees_staff_user')
    ALTER TABLE [dbo].[trainees] WITH CHECK
        ADD CONSTRAINT [FK_trainees_staff_user] FOREIGN KEY ([staff_user_id]) REFERENCES [dbo].[users] ([id]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_trainees_staff_user_id' AND object_id = OBJECT_ID('dbo.trainees'))
    CREATE INDEX [IX_trainees_staff_user_id] ON [dbo].[trainees] ([staff_user_id]) WHERE [staff_user_id] IS NOT NULL;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

UPDATE t
SET t.staff_user_id = ISNULL(t.staff_user_id, t.user_id),
    t.user_id = NULL,
    t.account_granted = 0,
    t.account_granted_at = NULL,
    t.updated_at = GETDATE()
FROM [dbo].[trainees] t
JOIN [dbo].[users] u ON u.id = t.user_id
LEFT JOIN [dbo].[roles] r ON r.id = u.role_id
WHERE ISNULL(r.code, '') <> 'trainee';

COMMIT;
GO
