/* ============================================================================
 * seminars: thêm SỐ LIỆU TỔNG HỢP nhập tay
 * ----------------------------------------------------------------------------
 * Cho phép ghi nhanh 1 hội thảo mà KHÔNG cần nhập từng người:
 *   - manual_participant_count : tổng số người tham dự
 *   - manual_internal_count / manual_external_count / manual_foreign_count
 *     : phân rã trong viện / ngoại viện / nước ngoài (tùy chọn, cho mẫu file 1.4)
 *   - manual_cme_count : số lượng chứng chỉ CME đã cấp
 *
 * Danh sách người tham dự chi tiết (bảng seminar_participants) vẫn dùng được
 * cho những hội nghị cần cấp CME theo tên + số quyết định. Khi có số nhập tay,
 * giao diện ưu tiên hiển thị số nhập tay.
 *
 * Script idempotent.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.seminars', N'manual_participant_count') IS NULL
    ALTER TABLE dbo.seminars ADD manual_participant_count INT NULL;
GO
IF COL_LENGTH(N'dbo.seminars', N'manual_internal_count') IS NULL
    ALTER TABLE dbo.seminars ADD manual_internal_count INT NULL;
GO
IF COL_LENGTH(N'dbo.seminars', N'manual_external_count') IS NULL
    ALTER TABLE dbo.seminars ADD manual_external_count INT NULL;
GO
IF COL_LENGTH(N'dbo.seminars', N'manual_foreign_count') IS NULL
    ALTER TABLE dbo.seminars ADD manual_foreign_count INT NULL;
GO
IF COL_LENGTH(N'dbo.seminars', N'manual_cme_count') IS NULL
    ALTER TABLE dbo.seminars ADD manual_cme_count INT NULL;
GO

PRINT N'✅ Migration 2026-09-04_seminar_manual_counts hoàn tất.';
GO
