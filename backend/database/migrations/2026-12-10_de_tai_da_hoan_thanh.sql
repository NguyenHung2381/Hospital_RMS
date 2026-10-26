/* ============================================================================
 * 2026-12-10_de_tai_da_hoan_thanh
 * ----------------------------------------------------------------------------
 *   Nhập bổ sung đề tài ĐÃ HOÀN THÀNH (đợt đã làm xong trước khi có hệ thống):
 *   người dùng nhập ở cổng nhân viên (/user/nhap-de-tai), đề tài vào hàng
 *   "Chờ duyệt" để quản lý NCKH xác nhận như đăng ký thường.
 *
 *   topics.is_legacy          1 = đề tài nhập bổ sung (đã hoàn thành). Cho chủ
 *                             nhiệm/thư ký sửa hồ sơ khi đang chờ duyệt/bổ sung
 *                             mà không cần mốc thời gian của đợt (đợt cũ đã đóng),
 *                             và không cấp tài khoản thành viên theo đợt.
 *   topics.acceptance_rating  Kết quả nghiệm thu: xuat_sac | tot | kha | dat | khong_dat
 *   topics.acceptance_score   Điểm nghiệm thu (0–100)
 *   topics.acceptance_date    Ngày nghiệm thu
 *
 * Idempotent — mỗi bước tự kiểm tra (COL_LENGTH / sys.check_constraints)
 * nên chạy lại nhiều lần an toàn. Chỉ THÊM cột.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.topics', N'is_legacy') IS NULL
    ALTER TABLE [dbo].[topics] ADD [is_legacy] BIT NOT NULL
        CONSTRAINT [DF_topics_is_legacy] DEFAULT (0);
GO

IF COL_LENGTH(N'dbo.topics', N'acceptance_rating') IS NULL
    ALTER TABLE [dbo].[topics] ADD [acceptance_rating] VARCHAR(20) NULL;
GO

IF COL_LENGTH(N'dbo.topics', N'acceptance_score') IS NULL
    ALTER TABLE [dbo].[topics] ADD [acceptance_score] DECIMAL(5, 2) NULL;
GO

IF COL_LENGTH(N'dbo.topics', N'acceptance_date') IS NULL
    ALTER TABLE [dbo].[topics] ADD [acceptance_date] DATE NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_topics_acceptance_rating')
    ALTER TABLE [dbo].[topics] WITH CHECK ADD CONSTRAINT [CHK_topics_acceptance_rating]
        CHECK ([acceptance_rating] IS NULL
               OR [acceptance_rating] IN ('xuat_sac', 'tot', 'kha', 'dat', 'khong_dat'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_topics_acceptance_score')
    ALTER TABLE [dbo].[topics] WITH CHECK ADD CONSTRAINT [CHK_topics_acceptance_score]
        CHECK ([acceptance_score] IS NULL OR ([acceptance_score] >= 0 AND [acceptance_score] <= 100));
GO
