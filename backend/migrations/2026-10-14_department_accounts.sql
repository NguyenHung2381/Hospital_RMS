/* ============================================================================
 * Tạo tài khoản khoa/phòng cho mọi khoa chưa có (departments.dept_account_id)
 * ----------------------------------------------------------------------------
 * QUY ƯỚC (giữ như các tài khoản khoa cũ)
 *   - id        = 'NV' + departments.code + '0000'
 *                 (sinh mã nhân viên dùng 'NV' + code + NNNN và bỏ qua đuôi
 *                 0000 — xem topicMemberService — nên không đụng nhau)
 *   - username  = LOWER(code)            vd: cls44, pcn8
 *   - full_name = N'Tài khoản ' + tên khoa
 *   - password  = mật khẩu mặc định của các tài khoản khoa cũ (bcrypt),
 *                 must_change_password = 1 ⇒ bắt đổi ở lần đăng nhập đầu
 *   - role      = VT07 Trưởng khoa; riêng PCN1 Ban Giám đốc = VT02 Giám đốc,
 *                 PCN4 Trung tâm Đào tạo = VT03 Quản lý NCKH (như trước)
 *
 *   Chỉ tạo cho khoa chưa có tài khoản, bỏ qua nếu id/username đã tồn tại.
 *   Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @default_pw VARCHAR(255) =
    '$2b$12$H1Xozi1kRUqWzpkg3/GIvOWG1KdKC.PcoQbpstJaWxX56BTy5sJcK';

DECLARE @acc TABLE (dept_id VARCHAR(20), user_id VARCHAR(20),
                    username VARCHAR(100), full_name NVARCHAR(255), role_id VARCHAR(6));

INSERT INTO @acc (dept_id, user_id, username, full_name, role_id)
SELECT d.id,
       'NV' + d.code + '0000',
       LOWER(d.code),
       N'Tài khoản ' + d.name,
       CASE d.code WHEN 'PCN1' THEN 'VT02'
                   WHEN 'PCN4' THEN 'VT03'
                   ELSE 'VT07' END
FROM [dbo].[departments] d
WHERE d.dept_account_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM [dbo].[users] u
                  WHERE u.id = 'NV' + d.code + '0000'
                     OR u.username = LOWER(d.code));

INSERT INTO [dbo].[users]
    ([id], [username], [password], [full_name], [department_id], [role_id],
     [is_active], [must_change_password], [created_by])
SELECT user_id, username, @default_pw, full_name, dept_id, role_id, 1, 1, 'SYSTEM'
FROM @acc;

UPDATE d
SET    d.dept_account_id = a.user_id,
       d.updated_at      = GETDATE(),
       d.updated_by      = 'SYSTEM'
FROM [dbo].[departments] d
JOIN @acc a ON a.dept_id = d.id;

COMMIT;

DECLARE @created INT = (SELECT COUNT(*) FROM @acc);
PRINT CONCAT(N'Đã tạo ', @created, N' tài khoản khoa/phòng.');
GO
