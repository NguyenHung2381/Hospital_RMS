-- Xuất tự động bởi scripts/dump-db-objects.js — sửa object trong DB (hoặc
-- migration) rồi chạy lại script, không sửa tay file này.
-- ============================================================
-- STORED PROCEDURES (có truyền SESSION_CONTEXT)
-- ============================================================

-- Tiện ích: set actor trước khi thực hiện thao tác
CREATE PROCEDURE [dbo].[sp_set_actor] @user_id VARCHAR(20) AS
BEGIN
    EXEC sp_set_session_context N'current_user_id', @user_id;
END;
