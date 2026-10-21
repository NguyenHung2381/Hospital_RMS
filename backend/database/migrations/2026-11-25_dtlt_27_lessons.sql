/* ============================================================================
 * Bài học cho chương trình ĐTLT_27 "Kỹ thuật cấp cứu cơ bản - Bác sĩ" — bị sót ở
 * 2026-11-12_dtlt_programs_lessons (nguồn: "Các bài học của lớp Kỹ thuật Cấp cứu cơ
 * bản - Bác sĩ.xlsx", thư mục "Bài học ĐTLT"). 26 bài, tổng 110 LT + 454 TH — khớp số
 * tiết chương trình. Khai giảng đưa lên đầu như các chương trình khác.
 * Lưu ý: file nguồn có Bài 4 và Bài 5 trùng tên "Chẩn đoán và xử trí ngộ độc thuốc tê"
 * — giữ nguyên theo file, phòng Đào tạo sửa tay nếu cần.
 *
 * Idempotent — chỉ thêm khi chương trình chưa có bài học nào.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET NOCOUNT ON;
GO

-- ĐTLT_27: 26 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_27');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_27_01', N'Khai giảng, kiểm tra đầu vào', 4, 0),
        (1, N'ĐTLT_27_02', N'Bài 1: Phân loại bệnh nhân cấp cứu theo mức độ ưu tiên', 4, 20),
        (2, N'ĐTLT_27_03', N'Bài 2: Hồi sinh tim phổi cơ bản', 4, 20),
        (3, N'ĐTLT_27_04', N'Bài 3: Cấp cứu phản vệ', 4, 20),
        (4, N'ĐTLT_27_05', N'Bài 4: Chẩn đoán và xử trí ngộ độc thuốc tê', 4, 20),
        (5, N'ĐTLT_27_06', N'Bài 5: Chẩn đoán và xử trí ngộ độc thuốc tê', 4, 20),
        (6, N'ĐTLT_27_07', N'Bài 6: Định hướng chẩn đoán và xử trí đau bụng cấp ở người lớn', 4, 20),
        (7, N'ĐTLT_27_08', N'Bài 7: Chẩn đoán và xử trí bệnh nhân xuất huyết tiêu hóa cao', 4, 20),
        (8, N'ĐTLT_27_09', N'Bài 8: Định hướng chẩn đoán và xử trí trước tình trạng ngất', 4, 20),
        (9, N'ĐTLT_27_10', N'Bài 9: Định hướng chẩn đoán và xử trí người bệnh hôn mê', 4, 20),
        (10, N'ĐTLT_27_11', N'Bài 10: Định hướng chẩn đoán và xử trí cấp cứu trước một trường hợp ngộ độc', 4, 20),
        (11, N'ĐTLT_27_12', N'Bài 11: Định hướng chẩn đoán và xử trí trước tình trạng đau đầu cấp', 4, 20),
        (12, N'ĐTLT_27_13', N'Bài 12: Chẩn đoán và xử trí cơn hen phế quản nặng', 4, 20),
        (13, N'ĐTLT_27_14', N'Bài 13: Chẩn đoán và xử trí đợt cấp bệnh phổi tắc nghẽn mãn tính', 4, 20),
        (14, N'ĐTLT_27_15', N'Bài 14: Định hướng chẩn đoán và xử trí khó thở cấp ở người lớn', 4, 20),
        (15, N'ĐTLT_27_16', N'Bài 15: Đánh giá và xử trí ban đầu một bệnh nhân đa chấn thương', 8, 20),
        (16, N'ĐTLT_27_17', N'Bài 16: Tiếp cận và xử trí ban đầu một bệnh nhân sốc', 4, 20),
        (17, N'ĐTLT_27_18', N'Bài 17: Sốc điện cấp cứu', 4, 20),
        (18, N'ĐTLT_27_19', N'Bài 18: Phân tích kết quả khí máu động mạch', 8, 24),
        (19, N'ĐTLT_27_20', N'Bài 19: Cài đặt ban đầu các thông số máy thở', 8, 20),
        (20, N'ĐTLT_27_21', N'Bài 20: Quy trình kỹ thuật đặt nội khí quản cấp cứu', 4, 20),
        (21, N'ĐTLT_27_22', N'Bài 21: Quy trình kỹ thuật đặt catheter tĩnh mạch trung tâm nhiều nòng dưới hướng dẫn siêu âm', 4, 20),
        (22, N'ĐTLT_27_23', N'Bài 22: Quy trình kỹ thuật đặt catheter tĩnh mạch trung tâm nhiều nòng', 4, 20),
        (23, N'ĐTLT_27_24', N'Kiểm tra giữa khóa học', 2, 2),
        (24, N'ĐTLT_27_25', N'Thi kết thúc khóa học', 4, 8),
        (25, N'ĐTLT_27_26', N'Tổng kết khóa học và nhận chứng chỉ', 0, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO

PRINT N'✅ Migration 2026-11-25_dtlt_27_lessons hoàn tất.';
GO
