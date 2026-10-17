/* ============================================================================
 * D0 — Cấp tài khoản đăng nhập cho học viên (nền tảng cho Điểm danh QR + Thi
 * online, Giai đoạn D)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   trainees hiện không có cách nào liên kết tới users — khác hẳn topic_members
 *   (đã có account_granted/account_granted_at/user_id + cơ chế "Cấp tài khoản").
 *   Thêm đúng 3 cột tương tự cho trainees, và 1 vai trò mới VT08 "Học viên" với
 *   quyền tối thiểu (chỉ xem dữ liệu CỦA CHÍNH MÌNH — khóa học/điểm/chứng chỉ/
 *   điểm danh — chặn bằng cách đối chiếu trainees.user_id = actor.id ở tầng
 *   service, không cần permission scope riêng).
 *
 *   VT08 chưa từng dùng (đã xác nhận qua GET /roles trước khi viết migration
 *   này) — an toàn để dùng làm mã vai trò mới.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

------------------------------------------------------------------------------
-- 1. trainees: thêm liên kết tài khoản (mirror topic_members)
------------------------------------------------------------------------------
IF COL_LENGTH('dbo.trainees', 'user_id') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [user_id] VARCHAR(20) NULL
        CONSTRAINT FK_trainees_user FOREIGN KEY REFERENCES [dbo].[users] ([id]);
GO
IF COL_LENGTH('dbo.trainees', 'account_granted') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [account_granted] BIT NOT NULL
        CONSTRAINT DF_trainees_account_granted DEFAULT (0);
GO
IF COL_LENGTH('dbo.trainees', 'account_granted_at') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [account_granted_at] DATETIME NULL;
GO

------------------------------------------------------------------------------
-- 2. Vai trò mới: VT08 "Học viên"
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM [dbo].[roles] WHERE [id] = 'VT08')
    INSERT INTO [dbo].[roles] (id, name, description, created_at, created_by)
    VALUES ('VT08', N'hoc_vien', N'Học viên — tự xem khóa học/điểm/chứng chỉ của mình, điểm danh QR, làm bài thi', GETDATE(), N'SYSTEM');
GO

PRINT N'✅ Migration 2026-09-28_trainee_accounts hoàn tất.';
GO
