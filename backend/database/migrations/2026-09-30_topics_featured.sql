/* ============================================================================
 * Thư viện đề tài công khai (topics.is_featured) — Giai đoạn D3
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Không tạo bảng mới — chỉ đánh dấu đề tài NÀO được đưa ra trang công khai
 *   "Thư viện đề tài" (chỉ đề tài đã duyệt mới lộ ra, lọc thêm ở tầng service
 *   publicPortalService.getFeaturedTopics(), không chỉ dựa vào cờ này).
 *   Không thêm permission mới — bật/tắt cờ dùng chung quyền 'topics:update'
 *   đã có (sửa qua TopicModal.tsx, chỉ hiện khi status='approved').
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.topics', 'is_featured') IS NULL
BEGIN
    ALTER TABLE [dbo].[topics] ADD [is_featured] BIT NOT NULL CONSTRAINT DF_topics_is_featured DEFAULT (0);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'IX_topics_is_featured' AND object_id = OBJECT_ID('dbo.topics')
)
BEGIN
    CREATE NONCLUSTERED INDEX [IX_topics_is_featured] ON [dbo].[topics] ([is_featured]) WHERE [is_featured] = 1;
END
GO

PRINT N'✅ Migration 2026-09-30_topics_featured hoàn tất.';
GO
