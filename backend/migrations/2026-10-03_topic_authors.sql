/* ============================================================================
 * Đồng tác giả có thứ tự cho Bài báo/Tập san — Giai đoạn D7
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Bảng CỘNG THÊM, KHÔNG đụng topics/topic_members hiện có (topic_members là
 *   "thành viên đề tài" nói chung — chủ nhiệm/thư ký/thành viên, dùng cho CẢ
 *   đề tài lẫn bài báo; topic_authors là khái niệm RIÊNG của bài báo: danh
 *   sách tác giả có THỨ TỰ in trên bài báo + đánh dấu tác giả liên hệ, khác
 *   hẳn vai trò leader/secretary/member). Chỉ áp dụng khi
 *   topics.article_type = 'bai_bao' — ràng buộc này chỉ kiểm ở tầng service/
 *   UI (TopicDrawer chỉ hiện tab khi đúng loại), không CHECK ở DB vì phải
 *   JOIN sang topics mỗi lần ghi, không cần thiết cho 1 ràng buộc nghiệp vụ
 *   đơn giản.
 *
 *   Không thêm permission mới — dùng lại 'topics:update' (sửa qua tab "Đồng
 *   tác giả" trong TopicDrawer, cùng quyền sửa đề tài).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF OBJECT_ID(N'dbo.topic_authors', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[topic_authors] (
        [id]              VARCHAR(20)   NOT NULL PRIMARY KEY,
        [topic_id]        VARCHAR(15)   NOT NULL,
        [author_name]     NVARCHAR(255) NOT NULL,
        [affiliation]     NVARCHAR(255) NULL,
        [author_order]    INT           NOT NULL CONSTRAINT DF_topic_authors_order DEFAULT (0),
        [is_corresponding] BIT          NOT NULL CONSTRAINT DF_topic_authors_corresponding DEFAULT (0),
        [created_at]      DATETIME      NOT NULL CONSTRAINT DF_topic_authors_created_at DEFAULT (GETDATE()),
        [created_by]      VARCHAR(20)   NULL,
        CONSTRAINT FK_topicauthor_topic FOREIGN KEY ([topic_id]) REFERENCES [dbo].[topics] ([id]) ON DELETE CASCADE
    );
    CREATE NONCLUSTERED INDEX [IX_topic_authors_topic] ON [dbo].[topic_authors] ([topic_id]);
END
GO

PRINT N'✅ Migration 2026-10-03_topic_authors hoàn tất.';
GO
