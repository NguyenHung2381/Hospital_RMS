/* ============================================================================
 * Đổi tên hiển thị vai trò từ mã snake_case sang tiếng Việt
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   roles.name đang là mã kỹ thuật (hoc_vien, quan_ly_nckh...) và được hiển
 *   thị thẳng ở màn Vai trò & Quyền, header người dùng, danh sách tài khoản.
 *
 *   An toàn khi đổi: mọi logic phân quyền dựa vào roles.id (VT01..VT08) hoặc
 *   role_permissions, KHÔNG so sánh roles.name. Ngoại lệ duy nhất là
 *   isLegacyAdminSession() (frontend/src/shared/utils/permissions.ts) — dự phòng
 *   cho phiên cũ chưa có mảng permissions — vốn đã nhận 'quản trị' / 'giám đốc'
 *   nên tên mới của VT01/VT02 vẫn khớp.
 *
 *   Chỉ đổi khi tên vẫn còn là mã gốc ⇒ không ghi đè tên admin đã tự đặt.
 *   Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

UPDATE r
SET    r.name = src.new_name,
       r.updated_at = GETDATE(),
       r.updated_by = 'SYSTEM'
FROM [dbo].[roles] r
JOIN (VALUES
    ('VT01', N'admin',              N'Quản trị hệ thống'),
    ('VT02', N'giam_doc',           N'Giám đốc'),
    ('VT03', N'quan_ly_nckh',       N'Quản lý NCKH'),
    ('VT04', N'hoi_dong_xet_duyet', N'Hội đồng xét duyệt'),
    ('VT05', N'chu_nhiem',          N'Chủ nhiệm đề tài'),
    ('VT06', N'thanh_vien',         N'Thành viên'),
    ('VT07', N'truong_khoa',        N'Trưởng khoa'),
    ('VT08', N'hoc_vien',           N'Học viên')
) AS src (id, old_name, new_name)
    ON r.id = src.id AND r.name = src.old_name;
GO

PRINT N'✅ Migration 2026-10-08_roles_vietnamese_names hoàn tất.';
GO
