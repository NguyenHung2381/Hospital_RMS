/* ============================================================================
 * Bổ sung hồ sơ học viên: địa chỉ thường trú, là nhân viên hay không
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   trainees đã có address/phone/national_id_issued_date/_place/graduated_year
 *   (2026-09-11_training_foundation, 2026-09-14_staff_practice_licenses) —
 *   còn thiếu địa chỉ THƯỜNG TRÚ (khác address hiện tại — có thể là nơi ở hiện
 *   tại) và cờ tường minh "là nhân viên bệnh viện hay không" (trước giờ chỉ
 *   suy luận ngầm qua department_id có giá trị hay không).
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.trainees', 'permanent_address') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [permanent_address] NVARCHAR(255) NULL; -- địa chỉ thường trú
GO
IF COL_LENGTH('dbo.trainees', 'is_employee') IS NULL
    ALTER TABLE [dbo].[trainees] ADD [is_employee] BIT NOT NULL CONSTRAINT DF_trainees_is_employee DEFAULT (0);
GO

PRINT N'✅ Migration 2026-09-20_trainee_extra_fields hoàn tất.';
GO
