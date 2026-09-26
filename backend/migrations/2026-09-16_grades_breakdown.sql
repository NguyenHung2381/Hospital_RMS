/* ============================================================================
 * Điểm thành phần + xếp loại cho Kết quả học tập (grades)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH
 *   Đối chiếu QLNCKHDTCDT-main: dt_ket_qua_hoc_tap tách điểm thường xuyên/
 *   giữa kỳ/cuối kỳ + xếp loại + hàm recalc tự tính điểm tổng kết. grades ở
 *   RMS hiện chỉ có 1 cột score (điểm tổng) + result (pass/fail) — không đủ
 *   chi tiết để làm bảng điểm/báo cáo theo đúng nghiệp vụ đào tạo thực tế.
 *
 *   Cột thêm đều NULL-able, không phá dữ liệu/API cũ: nơi nào chỉ set score/
 *   result thủ công (không dùng điểm thành phần) vẫn hoạt động như trước.
 *
 *   Không thêm permission mới — dùng lại courses:update.
 *
 * Script idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO

IF COL_LENGTH('dbo.grades', 'regular_score') IS NULL
    ALTER TABLE [dbo].[grades] ADD [regular_score] DECIMAL(5,2) NULL;
GO
IF COL_LENGTH('dbo.grades', 'midterm_score') IS NULL
    ALTER TABLE [dbo].[grades] ADD [midterm_score] DECIMAL(5,2) NULL;
GO
IF COL_LENGTH('dbo.grades', 'final_score') IS NULL
    ALTER TABLE [dbo].[grades] ADD [final_score] DECIMAL(5,2) NULL;
GO
IF COL_LENGTH('dbo.grades', 'classification') IS NULL
    ALTER TABLE [dbo].[grades] ADD [classification] NVARCHAR(20) NULL;
GO

PRINT N'✅ Migration 2026-09-16_grades_breakdown hoàn tất.';
GO
