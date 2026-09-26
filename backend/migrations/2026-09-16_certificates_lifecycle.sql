/* ============================================================================
 * Vòng đời chứng chỉ: hạn sử dụng + thu hồi mềm (certificates)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu QLNCKHDTCDT-main: dt_chung_chi có ngay_het_han + trang_thai
 *   (Đã cấp/Thu hồi). certificates ở RMS hiện chỉ có issue_date, và hàm
 *   removeCertificate() là DELETE cứng dù UI gọi là "thu hồi" — mất dữ liệu/
 *   lịch sử. Bổ sung status + expiry_date + revoked_at/by/reason để hỗ trợ
 *   thu hồi mềm (giữ lại dòng dữ liệu), tách biệt với xoá cứng (dùng khi nhập
 *   nhầm).
 *
 *   Không thêm permission mới — dùng lại courses:approve (đã dùng cho issue/
 *   remove certificate).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.certificates', 'status') IS NULL
    ALTER TABLE [dbo].[certificates] ADD [status] VARCHAR(15) NOT NULL
        CONSTRAINT DF_certificates_status DEFAULT ('active');
GO
IF COL_LENGTH('dbo.certificates', 'expiry_date') IS NULL
    ALTER TABLE [dbo].[certificates] ADD [expiry_date] DATE NULL;
GO
IF COL_LENGTH('dbo.certificates', 'revoked_at') IS NULL
    ALTER TABLE [dbo].[certificates] ADD [revoked_at] DATETIME NULL;
GO
IF COL_LENGTH('dbo.certificates', 'revoked_by') IS NULL
    ALTER TABLE [dbo].[certificates] ADD [revoked_by] VARCHAR(20) NULL;
GO
IF COL_LENGTH('dbo.certificates', 'revoke_reason') IS NULL
    ALTER TABLE [dbo].[certificates] ADD [revoke_reason] NVARCHAR(255) NULL;
GO

PRINT N'✅ Migration 2026-09-16_certificates_lifecycle hoàn tất.';
GO
