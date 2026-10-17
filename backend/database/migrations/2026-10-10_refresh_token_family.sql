/* ============================================================================
 * Xoay refresh token có phát hiện dùng lại (refresh token reuse detection)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Trước đây mỗi lần làm mới phiên, refresh token cũ bị XOÁ. Nếu token bị
 *   đánh cắp, kẻ tấn công và người dùng thật dùng song song, bên nào làm mới
 *   trước thì bên kia chỉ nhận 401 — không ai biết phiên đã bị lộ.
 *
 *   Giờ token cũ được đánh dấu revoked_at (giữ tới khi hết hạn) và mọi token
 *   sinh ra từ cùng 1 lần đăng nhập mang chung family_id. Token đã thu hồi mà
 *   còn được dùng lại (quá vài giây — không phải 2 tab làm mới cùng lúc) ⇒
 *   xoá cả họ token + thu hồi mọi access token (users.token_version).
 *
 *   Idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.refresh_tokens', 'family_id') IS NULL
    ALTER TABLE [dbo].[refresh_tokens] ADD family_id VARCHAR(60) NULL;
GO
IF COL_LENGTH('dbo.refresh_tokens', 'revoked_at') IS NULL
    ALTER TABLE [dbo].[refresh_tokens] ADD revoked_at DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_rt_family' AND object_id = OBJECT_ID('dbo.refresh_tokens'))
    CREATE INDEX IX_rt_family ON [dbo].[refresh_tokens](family_id) WHERE family_id IS NOT NULL;
GO

PRINT N'✅ Migration 2026-10-10_refresh_token_family hoàn tất.';
GO
