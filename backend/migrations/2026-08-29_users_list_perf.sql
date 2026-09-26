/* ============================================================================
 * Tăng tốc màn "Quản lý người dùng" (GET /api/v1/users) và ô tìm thành viên
 * (GET /api/v1/users/search)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   userService.getAll trả về danh sách phân trang + thống kê. Câu list sắp xếp
 *   theo u.created_at DESC nhưng KHÔNG có index cho cột này -> mỗi lần mở trang
 *   / chuyển trang SQL Server phải Sort toàn bộ bảng users (~1.6k dòng) rồi mới
 *   OFFSET/FETCH. searchForMember sắp xếp theo u.full_name cũng không có index.
 *
 * THAY ĐỔI (chỉ thêm index, không đụng dữ liệu — an toàn, idempotent)
 *   1. IX_users_created_at_desc  : phủ (covering) đúng các cột câu list cần ->
 *      câu list trở thành "đọc TOP N theo index", bỏ hẳn toán tử Sort.
 *   2. IX_users_active_fullname  : filtered (is_active = 1) + sắp theo full_name
 *      -> phục vụ searchForMember (luôn lọc is_active = 1, ORDER BY full_name).
 *
 * Chạy lại nhiều lần an toàn. Tạo index ONLINE = OFF (SQL Server Express không
 * hỗ trợ ONLINE); bảng nhỏ nên thời gian khoá không đáng kể.
 * ==========================================================================*/

------------------------------------------------------------------------------
-- 1. Index phủ cho câu danh sách (sắp xếp mặc định created_at DESC)
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_users_created_at_desc'
                                           AND object_id = OBJECT_ID(N'dbo.users'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_users_created_at_desc
        ON dbo.users (created_at DESC)
        INCLUDE (username, staff_number, full_name, email, account_type,
                 is_active, department_id, role_id,
                 can_sit_council, can_chair_council,
                 password_changed_at, updated_at);
END
GO

------------------------------------------------------------------------------
-- 2. Index cho ô tìm thành viên: WHERE is_active = 1 ... ORDER BY full_name
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_users_active_fullname'
                                           AND object_id = OBJECT_ID(N'dbo.users'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_users_active_fullname
        ON dbo.users (full_name)
        INCLUDE (username, staff_number, email, department_id)
        WHERE is_active = 1;
END
GO

------------------------------------------------------------------------------
-- 3. Cập nhật thống kê để optimizer chọn plan mới ngay
------------------------------------------------------------------------------
UPDATE STATISTICS dbo.users;
GO

/* --------------------------------------------------------------------------
 * Kiểm tra nhanh sau khi chạy:
 *   SET STATISTICS IO, TIME ON;
 *   SELECT TOP 20 id, full_name, created_at
 *   FROM users ORDER BY created_at DESC;      -- plan phải là Index Scan
 *                                             -- trên IX_users_created_at_desc,
 *                                             -- KHÔNG còn Sort
 * ------------------------------------------------------------------------*/
