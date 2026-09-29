/* ============================================================================
 * Cho phép created_by = NULL ở topics / topic_members / approvals
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đăng ký đề tài trên cổng công khai (/de-xuat-de-tai) không có tài khoản
 *   đứng sau ⇒ actor = NULL (giống trainees/course_enrollments khi đăng ký
 *   khoá học công khai). Ba cột này NOT NULL nên INSERT lỗi:
 *   "Cannot insert the value NULL into column 'created_by', table 'topics'".
 *   FK_topic_creator vẫn giữ (NULL không bị kiểm tra FK). Các thủ tục gửi
 *   thông báo đã lọc "created_by IS NOT NULL".
 *
 *   topics.created_by nằm trong 2 index ⇒ phải drop rồi tạo lại quanh ALTER.
 *   Server tự chạy bước này lúc khởi động (permissions/migrations.js) nếu login
 *   ứng dụng có quyền ALTER; không có thì DBA chạy file này. Idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET XACT_ABORT ON;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.topics') AND name = 'created_by' AND is_nullable = 0)
BEGIN
    BEGIN TRANSACTION;
    DROP INDEX idx_topics_created_by   ON [dbo].[topics];
    DROP INDEX idx_topics_round_status ON [dbo].[topics];
    ALTER TABLE [dbo].[topics] ALTER COLUMN created_by VARCHAR(20) NULL;
    CREATE NONCLUSTERED INDEX idx_topics_created_by ON [dbo].[topics](created_by);
    CREATE NONCLUSTERED INDEX idx_topics_round_status ON [dbo].[topics](round_id, status)
        INCLUDE (title, department_id, category_id, level_id, created_by, created_at);
    COMMIT TRANSACTION;
END
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.topic_members') AND name = 'created_by' AND is_nullable = 0)
    ALTER TABLE [dbo].[topic_members] ALTER COLUMN created_by VARCHAR(20) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.approvals') AND name = 'created_by' AND is_nullable = 0)
    ALTER TABLE [dbo].[approvals] ALTER COLUMN created_by VARCHAR(20) NULL;
GO

PRINT N'✅ Migration 2026-10-16_public_topic_null_creator hoàn tất.';
GO
