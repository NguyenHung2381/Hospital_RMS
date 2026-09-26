/* ============================================================================
 * Rút gọn loại mốc thời gian (round_deadlines.deadline_type) còn 3 loại
 * ----------------------------------------------------------------------------
 *   edit               — "Sửa"        : chủ nhiệm/thư ký sửa toàn bộ đề tài
 *   supplement         — "Bổ sung"    : chỉ sửa những mục đã cấu hình
 *   report_submission  — "Nộp báo cáo": chỉ tải lên file mới
 *
 * - Thêm cột supplement_fields (danh sách mục được sửa, phân tách bằng dấu phẩy).
 * - Đổi 'registration' -> 'edit'; dồn 'council_submission' -> 'report_submission'.
 * - Cập nhật CHECK constraint CHK_rd_type.
 * Script idempotent, chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL]
GO

------------------------------------------------------------------------------
-- 1. Cột supplement_fields
------------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.round_deadlines', N'supplement_fields') IS NULL
BEGIN
    ALTER TABLE dbo.round_deadlines ADD supplement_fields VARCHAR(120) NULL;
END
GO

------------------------------------------------------------------------------
-- 2. Gỡ CHECK cũ để có thể đổi dữ liệu
------------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_rd_type')
    ALTER TABLE dbo.round_deadlines DROP CONSTRAINT CHK_rd_type;
GO

------------------------------------------------------------------------------
-- 3. Chuyển dữ liệu hiện có
------------------------------------------------------------------------------
UPDATE dbo.round_deadlines SET deadline_type = 'edit'
WHERE deadline_type = 'registration';

-- Không còn dùng 'council_submission' — gộp về 'report_submission'
UPDATE dbo.round_deadlines SET deadline_type = 'report_submission'
WHERE deadline_type = 'council_submission';

-- Bản ghi lạ khác (nếu có) đưa về 'edit' cho an toàn
UPDATE dbo.round_deadlines SET deadline_type = 'edit'
WHERE deadline_type NOT IN ('edit', 'supplement', 'report_submission');

-- supplement_fields chỉ có ý nghĩa với loại 'supplement'
UPDATE dbo.round_deadlines SET supplement_fields = NULL
WHERE deadline_type <> 'supplement';
GO

------------------------------------------------------------------------------
-- 4. CHECK constraint mới
------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CHK_rd_type')
BEGIN
    ALTER TABLE dbo.round_deadlines WITH CHECK
        ADD CONSTRAINT CHK_rd_type CHECK
        (deadline_type IN ('edit', 'supplement', 'report_submission'));
END
GO

------------------------------------------------------------------------------
-- 5. LƯU Ý THỦ CÔNG
------------------------------------------------------------------------------
-- Proc [dbo].[sp_process_daily_deadlines] còn tham chiếu chuỗi 'registration' /
-- 'council_submission' trong khối ghi deadline_actions 'auto_close'. Đây chỉ là
-- bản ghi kiểm toán, không ảnh hưởng chức năng nhắc hạn (chạy theo deadline_date).
-- Khi tiện, sửa danh sách IN của proc thành:
--   ('edit', 'supplement', 'report_submission')
PRINT N'>> Nhớ cập nhật danh sách deadline_type trong sp_process_daily_deadlines.';
GO
