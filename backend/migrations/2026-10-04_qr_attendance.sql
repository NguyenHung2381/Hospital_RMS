/* ============================================================================
 * Điểm danh QR động (khóa đào tạo + hội thảo CME) — Giai đoạn D8
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Phụ thuộc D0 (2026-09-28_trainee_accounts.sql) — học viên phải có tài
 *   khoản đăng nhập để tự quét QR điểm danh.
 *
 *   attendance (khóa đào tạo): thêm method ('manual' mặc định, 'qr' khi tự
 *   quét) + checked_in_at (thời điểm quét — khác updated_at vốn cũng đổi khi
 *   giảng viên sửa tay). Không đổi status mặc định ('absent') — điểm danh QR
 *   chỉ set status='present' khi quét thành công, còn lại vẫn 'absent' như
 *   trước (giảng viên sửa tay nếu cần).
 *
 *   seminar_participants (hội thảo/CME): chỉ thêm checked_in_at — bảng này đã
 *   có sẵn user_id (khác course_enrollments phải qua trainees), nên tự quét
 *   chỉ cần so user_id = tài khoản đang đăng nhập. v1 chỉ 1 lượt quét (không
 *   tính tỷ lệ thời gian tham dự vào/ra — để sau nếu cần).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH(N'dbo.attendance', N'method') IS NULL
    ALTER TABLE [dbo].[attendance] ADD [method] VARCHAR(10) NOT NULL CONSTRAINT DF_attendance_method DEFAULT ('manual');
GO
IF COL_LENGTH(N'dbo.attendance', N'checked_in_at') IS NULL
    ALTER TABLE [dbo].[attendance] ADD [checked_in_at] DATETIME NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_attendance_method')
    ALTER TABLE [dbo].[attendance] WITH CHECK ADD CONSTRAINT [CHK_attendance_method]
        CHECK ([method] IN ('manual', 'qr'));
GO

IF COL_LENGTH(N'dbo.seminar_participants', N'checked_in_at') IS NULL
    ALTER TABLE [dbo].[seminar_participants] ADD [checked_in_at] DATETIME NULL;
GO

PRINT N'✅ Migration 2026-10-04_qr_attendance hoàn tất.';
GO
