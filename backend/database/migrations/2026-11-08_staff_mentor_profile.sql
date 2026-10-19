/* ============================================================================
 * Đào tạo GĐ2 — Thông tin giảng viên / người hướng dẫn thực hành (NHD)
 * ----------------------------------------------------------------------------
 * Nhập file "Danh sách người hành nghề" (2.xlsx) và chụp thông tin NHD lên hồ
 * sơ thực hành GPHN (Phiếu nhận xét cần ông/bà, ngày sinh, số CCHN, phạm vi).
 * Xem docs/ke-hoach-sua-dao-tao.md mục 4.7.
 *
 * 1. users.gender: 'male' | 'female' | 'other' (utils/gender.js) — mục "ông/bà".
 *    Ngày sinh dùng cột có sẵn users.date_of_birth (không thêm users.dob).
 * 2. staff_practice_licenses.scope_code: "Mã hoá phạm vi điều chỉnh theo 2148
 *    (BHXH)", vd 101 hoặc 101.23 — giữ dạng chữ để không mất số 0 / dấu chấm.
 *
 * CCCD của nhân sự cố ý KHÔNG lưu (không mẫu giấy tờ nào dùng).
 * Idempotent — mỗi bước tự kiểm tra nên chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

------------------------------------------------------------------------------
-- 1. Giới tính nhân sự
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.users', N'gender') IS NULL
    ALTER TABLE [dbo].[users] ADD [gender] VARCHAR(10) NULL;
GO

------------------------------------------------------------------------------
-- 2. Mã hoá phạm vi hành nghề theo QĐ 2148 (BHXH)
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.staff_practice_licenses', N'scope_code') IS NULL
    ALTER TABLE [dbo].[staff_practice_licenses] ADD [scope_code] NVARCHAR(50) NULL;
GO
