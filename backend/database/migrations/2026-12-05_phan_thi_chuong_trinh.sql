/* ============================================================================
 * 2026-12-05_phan_thi_chuong_trinh
 * ----------------------------------------------------------------------------
 *   Phần thi cuối khóa theo chương trình (docs/ke-hoach-thiet-ke-lai-luong-dao-tao.md
 *   GĐ4 mục 15): training_programs.exam_parts
 *   - 'theory'   chỉ thi lý thuyết
 *   - 'practice' chỉ thi thực hành
 *   - 'both'     thi cả 2 phần
 *   - NULL       tự suy theo số tiết LT/TH (phần có tiết > 0 thì thi; chưa
 *                khai số tiết thì coi như cả 2) — đúng cách tính trước đây.
 *   Bảng điểm (gradebookService) chỉ hiện và chỉ bắt buộc phần đã cấu hình.
 * Idempotent — chạy lại nhiều lần an toàn. Chỉ THÊM cột.
 * ==========================================================================*/

IF COL_LENGTH(N'dbo.training_programs', N'exam_parts') IS NULL
    ALTER TABLE [dbo].[training_programs] ADD [exam_parts] VARCHAR(10) NULL
        CONSTRAINT CHK_training_programs_exam_parts CHECK ([exam_parts] IN ('theory', 'practice', 'both'));
GO
