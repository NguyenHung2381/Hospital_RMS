/* ============================================================================
 * Dữ liệu chương trình ĐTLT + bài học (nhập từ "Chi tiết chương trình học ĐTLT.xlsx"
 * và thư mục "Bài học ĐTLT" của phòng Đào tạo — 2026-10-20).
 * ----------------------------------------------------------------------------
 * 1) Cập nhật 57 chương trình theo MÃ (training_programs.code): loại hình ĐTLT, số tiết
 *    LT/TH, thời lượng, đối tượng, sĩ số tối thiểu/tối đa, khoa (tra theo departments.code —
 *    không có mã khoa đó thì giữ khoa đang có), ghi chú khoa.
 * 2) Thêm bài học (lesson_kind theory, mã <mã CT>_NN) cho 32 chương trình — CHỈ khi
 *    chương trình đó chưa có bài học nào (đã nhập / đã sửa tay thì bỏ qua).
 * Chương trình không tồn tại trong DB thì bỏ qua. Cần chạy sau 2026-11-12 (cột min_capacity).
 * File sinh từ DB dev; nguồn Excel nhập bằng scripts/import-dtlt-lessons.js.
 *
 * Idempotent — chạy lại nhiều lần an toàn.
 * ==========================================================================*/
USE [RMS_HOSPITAL];
GO
SET NOCOUNT ON;
GO

-- 1) Thông tin chương trình
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 188, practice_hours = 340,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 1, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS9'), department_id), -- Khoa Giải Phẫu Bệnh
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_1';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 132, practice_hours = 1308,
    duration = N'09 tháng', duration_value = 9, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 5, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS21'), department_id), -- Khoa Chấn Thương - Chỉnh Hình
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_2';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 80, practice_hours = 240,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 10, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS37'), department_id), -- Khoa Nội Tiết - ĐTĐ
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_3';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 50, practice_hours = 430,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng, KTV', min_capacity = 5, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS1'), department_id), -- Khoa Thăm Dò Chức Năng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_4';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 92, practice_hours = 388,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 5, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS1'), department_id), -- Khoa Thăm Dò Chức Năng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_5';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 60, practice_hours = 420,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 5, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS1'), department_id), -- Khoa Thăm Dò Chức Năng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_6';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 60, practice_hours = 420,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ đã có CC nội soi chẩn đoán đường tiêu hóa trên hoặc nội soi đại tràng', min_capacity = 5, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS1'), department_id), -- Khoa Thăm Dò Chức Năng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_7';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 50, practice_hours = 430,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ đã có CC nội soi chẩn đoán đường tiêu hóa trên', min_capacity = 5, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS1'), department_id), -- Khoa Thăm Dò Chức Năng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_8';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 102, practice_hours = 378,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 10, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS19'), department_id), -- Khoa Ngoại Tiêu Hóa
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_9';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 130, practice_hours = 246,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ, Dược sĩ, Cử nhân, KTV xét nghiệm', min_capacity = 1, max_capacity = 8,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS7'), department_id), -- Khoa Hóa Sinh
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_10';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 48, practice_hours = 912,
    duration = N'06 tháng', duration_value = 6, duration_unit = N'month',
    target_audience = N'Bác sĩ đã có CCHN', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS45'), department_id), -- Trung Tâm Đột Quỵ
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_11';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 60, practice_hours = 120,
    duration = N'02 tháng', duration_value = 2, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 5, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS41'), department_id), -- Khoa Nội Tim Mạch 1
    department_note = COALESCE(N'Trung tâm Tim mạch', department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_12';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 80, practice_hours = 160,
    duration = N'02 tháng', duration_value = 2, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 10, max_capacity = 20,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS41'), department_id), -- Khoa Nội Tim Mạch 1
    department_note = COALESCE(N'Trung tâm Tim mạch', department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_13';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 60, practice_hours = 120,
    duration = N'1,5 tháng', duration_value = 1.5, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 3, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS44'), department_id), -- Khoa Thần Kinh
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_14';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 39, practice_hours = 17,
    duration = N'07 ngày', duration_value = 7, duration_unit = N'day',
    target_audience = N'Điều dưỡng, hộ sinh, KTV', min_capacity = 20, max_capacity = 25,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'PCN6'), department_id), -- Phòng Điều Dưỡng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_17';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 89, practice_hours = 419,
    duration = N'06 tháng', duration_value = 6, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 1, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS14'), department_id), -- Khoa Gây Mê Hồi Sức
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_18';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 81, practice_hours = 269,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 1, max_capacity = 8,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS14'), department_id), -- Khoa Gây Mê Hồi Sức
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_19';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 126, practice_hours = 310,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 1, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS2'), department_id), -- Khoa X-Quang
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_20';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 96, practice_hours = 410,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 1, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS2'), department_id), -- Khoa X-Quang
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_21';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 88, practice_hours = 310,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ, KTV', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS27'), department_id), -- Khoa Tai Mũi Họng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_23';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 32, practice_hours = 96,
    duration = N'01 tháng', duration_value = 1, duration_unit = N'month',
    target_audience = N'Bác sĩ, KTV', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS27'), department_id), -- Khoa Tai Mũi Họng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_24';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 96, practice_hours = 360,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng, KTV', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS27'), department_id), -- Khoa Tai Mũi Họng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_25';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 48, practice_hours = 352,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS28'), department_id), -- Khoa Răng Hàm Mặt
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_26';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 110, practice_hours = 454,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS13'), department_id), -- Khoa Cấp Cứu
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_27';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 94, practice_hours = 449,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng, KTV', min_capacity = 2, max_capacity = 25,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS13'), department_id), -- Khoa Cấp Cứu
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_28';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 150, practice_hours = 330,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ đã có CCHN', min_capacity = 2, max_capacity = 5,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS29'), department_id), -- Khoa Mắt
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_29';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 90, practice_hours = 150,
    duration = N'1,5 tháng', duration_value = 1.5, duration_unit = N'month',
    target_audience = N'Bác sĩ đã có CCHN', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS29'), department_id), -- Khoa Mắt
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_30';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 24, practice_hours = 16,
    duration = N'05 ngày', duration_value = 5, duration_unit = N'day',
    target_audience = N'Nhân viên y tế', min_capacity = 10, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS10'), department_id), -- Khoa Kiểm Soát Nhiễm Khuẩn
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_31';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 10, practice_hours = 30,
    duration = N'07 ngày', duration_value = 7, duration_unit = N'day',
    target_audience = N'Bác sĩ, điều dưỡng, hộ sinh, KTV', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS13'), department_id), -- Khoa Cấp Cứu
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_32';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 200, practice_hours = 200,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'BS có CCHN', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS20'), department_id), -- Khoa Phẫu Thuật Thần Kinh Cột Sống
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_33';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 27, practice_hours = 11,
    duration = N'04 ngày', duration_value = 4, duration_unit = N'day',
    target_audience = N'Điều dưỡng, hộ sinh, KTV', min_capacity = 20, max_capacity = 35,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'PCN6'), department_id), -- Phòng Điều Dưỡng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_34';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 21, practice_hours = 29,
    duration = N'05 ngày', duration_value = 5, duration_unit = N'day',
    target_audience = N'Điều dưỡng, hộ sinh', min_capacity = 2, max_capacity = 25,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'PCN6'), department_id), -- Phòng Điều Dưỡng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_35';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 20, practice_hours = 280,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 1, max_capacity = 5,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS35'), department_id), -- Khoa Nội Dị Ứng - Hô Hấp
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_37';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 128, practice_hours = 340,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS32'), department_id), -- Khoa Hồi Sức Tích Cực - Ngoại Khoa
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_38';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 112, practice_hours = 336,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS32'), department_id), -- Khoa Hồi Sức Tích Cực - Ngoại Khoa
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_39';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 100, practice_hours = 378,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS32'), department_id), -- Khoa Hồi Sức Tích Cực - Ngoại Khoa
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_40';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 116, practice_hours = 412,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ, Y sĩ, Điều dưỡng, Hộ sinh, KTV', min_capacity = 1, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS6'), department_id), -- Khoa Huyết Học
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_41';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 66, practice_hours = 462,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS43'), department_id), -- Khoa Nội Cơ Xương Khớp
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_42';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 150, practice_hours = 330,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ nhãn khoa đã có CCHN', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS29'), department_id), -- Khoa Mắt
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_44';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 48, practice_hours = 370,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 2, max_capacity = 5,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS16'), department_id), -- Khoa Ngoại Tổng Hợp 2
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_45';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 152, practice_hours = 652,
    duration = N'06 tháng', duration_value = 6, duration_unit = N'month',
    target_audience = N'ĐD, KTV', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS38'), department_id), -- Khoa Nội Thận - Tiết Niệu - Lọc Máu
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_46';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 156, practice_hours = 656,
    duration = N'06 tháng', duration_value = 6, duration_unit = N'month',
    target_audience = N'BS', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS38'), department_id), -- Khoa Nội Thận - Tiết Niệu - Lọc Máu
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_47';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 48, practice_hours = 436,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'BS, KTV xét nghiệm, Cử nhân sinh học, ĐD, Dược sĩ', min_capacity = 1, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS5'), department_id), -- Khoa Vi Sinh
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_48';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 228, practice_hours = 268,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'BS, ĐD,KTV, YS YHCT', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS47'), department_id), -- Khoa Y Học Cổ Truyền
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_49';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 172, practice_hours = 296,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'BS, ĐD,KTV, YS YHCT', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS47'), department_id), -- Khoa Y Học Cổ Truyền
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_50';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 96, practice_hours = 440,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 1, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS2'), department_id), -- Khoa X-Quang
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_51';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 100, practice_hours = 304,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS50'), department_id), -- Khoa Nhiễm Khuẩn Tổng Hợp
    department_note = COALESCE(N'Trung tâm Bệnh nhiệt đới', department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_52';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 128, practice_hours = 416,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ đã có CCHN/GPHN', min_capacity = 1, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS43'), department_id), -- Khoa Nội Cơ Xương Khớp
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_53';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 198, practice_hours = 282,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS34'), department_id), -- Khoa Nội Tiêu Hóa
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_54';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 177, practice_hours = 187,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 5, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS39'), department_id), -- Khoa Nội Huyết Học Lâm Sàng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_55';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 68, practice_hours = 440,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng, KTV', min_capacity = 1, max_capacity = 12,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS14'), department_id), -- Khoa Gây Mê Hồi Sức
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_56';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 126, practice_hours = 274,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng, Y sỹ, KTV', min_capacity = 1, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS14'), department_id), -- Khoa Gây Mê Hồi Sức
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_57';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 72, practice_hours = 288,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 10, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS45'), department_id), -- Trung Tâm Đột Quỵ
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_63';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 260, practice_hours = 684,
    duration = N'09 tháng', duration_value = 9, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 10, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS48'), department_id), -- Khoa Phục Hồi Chức Năng
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_64';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 82, practice_hours = 436,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 1, max_capacity = 20,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS30'), department_id), -- Khoa Hồi Sức Tích Cực
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_65';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 160, practice_hours = 390,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Bác sĩ', min_capacity = 2, max_capacity = 10,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS30'), department_id), -- Khoa Hồi Sức Tích Cực
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_66';
UPDATE training_programs SET
    training_type_id = 'TRNTP-DTLT', theory_hours = 128, practice_hours = 377,
    duration = N'03 tháng', duration_value = 3, duration_unit = N'month',
    target_audience = N'Điều dưỡng', min_capacity = 2, max_capacity = 15,
    department_id = COALESCE((SELECT id FROM departments WHERE code = N'CLS30'), department_id), -- Khoa Hồi Sức Tích Cực
    department_note = COALESCE(NULL, department_note),
    updated_at = GETDATE(), updated_by = 'SYSTEM'
WHERE code = N'ĐTLT_67';
GO

-- 2) Bài học — mỗi chương trình 1 batch
-- ĐTLT_2: 32 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_2');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_2_01', N'Khai giảng, kiểm tra đầu vào', 4, 0),
        (1, N'ĐTLT_2_02', N'Bài 1. Đại cương về gãy xương', 8, 46),
        (2, N'ĐTLT_2_03', N'Bài 2. Hoại thư sinh hơi', 4, 46),
        (3, N'ĐTLT_2_04', N'Bài 3. Hội chứng chèn ép khoang cấp tính', 4, 46),
        (4, N'ĐTLT_2_05', N'Bài 4. Gãy xương hở', 4, 46),
        (5, N'ĐTLT_2_06', N'Bài 5. Gãy xương vai', 4, 46),
        (6, N'ĐTLT_2_07', N'Bài 6. Gãy xương đòn', 4, 46),
        (7, N'ĐTLT_2_08', N'Bài 7. Gãy xương cánh tay', 4, 46),
        (8, N'ĐTLT_2_09', N'Bài 8. Gãy hai xương cẳng tay', 4, 46),
        (9, N'ĐTLT_2_10', N'Bài 9. Gãy đầu dưới xương quay', 4, 46),
        (10, N'ĐTLT_2_11', N'Bài 10. Gãy khung chậu', 4, 46),
        (11, N'ĐTLT_2_12', N'Bài 11. Gãy cổ xương đùi', 4, 46),
        (12, N'ĐTLT_2_13', N'Bài 12. Gãy xương đùi', 4, 46),
        (13, N'ĐTLT_2_14', N'Bài 13. Gãy xương gót', 4, 46),
        (14, N'ĐTLT_2_15', N'Bài 14. Gãy xương bánh chè', 4, 46),
        (15, N'ĐTLT_2_16', N'Bài 15. Gãy xương cẳng chân', 4, 46),
        (16, N'ĐTLT_2_17', N'Bài 16. Gãy mâm chày', 4, 46),
        (17, N'ĐTLT_2_18', N'Bài 17. Đại cương về trật khớp.', 4, 46),
        (18, N'ĐTLT_2_19', N'Bài 18. Trật khớp vai.', 4, 46),
        (19, N'ĐTLT_2_20', N'Bài 19. Trật khớp khuỷu', 4, 46),
        (20, N'ĐTLT_2_21', N'Bài 20. Trật khớp háng', 4, 46),
        (21, N'ĐTLT_2_22', N'Bài 21. Trật khớp gối', 4, 46),
        (22, N'ĐTLT_2_23', N'Bài 22. Vết thương khớp', 4, 46),
        (23, N'ĐTLT_2_24', N'Bài 23. Viêm xương tủy xương', 4, 46),
        (24, N'ĐTLT_2_25', N'Bài 24. U xương', 4, 46),
        (25, N'ĐTLT_2_26', N'Bài 25. Gãy xương vùng bàn tay', 4, 46),
        (26, N'ĐTLT_2_27', N'Bài 26. Gãy xương thuyền', 4, 46),
        (27, N'ĐTLT_2_28', N'Bài 27. Vết thương bàn tay', 4, 46),
        (28, N'ĐTLT_2_29', N'Bài 28. Nhiễm khuẩn bàn tay', 4, 46),
        (29, N'ĐTLT_2_30', N'Kiểm tra giữa khóa học', 4, 0),
        (30, N'ĐTLT_2_31', N'Thi kết thúc học phần', 4, 4),
        (31, N'ĐTLT_2_32', N'Tổng kết khóa học và nhận chứng chỉ', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_9: 22 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_9');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_9_01', N'Khai giảng, kiểm tra đầu vào', 4, 0),
        (1, N'ĐTLT_9_02', N'Lịch sử của nội soi và PTNS', 4, 0),
        (2, N'ĐTLT_9_03', N'Phương tiện và dụng cụ PTNS', 4, 8),
        (3, N'ĐTLT_9_04', N'Năng lượng điện, laser và siêu âm trong PTNS', 4, 4),
        (4, N'ĐTLT_9_05', N'Chuẩn bị bệnh nhân và phòng mổ', 4, 4),
        (5, N'ĐTLT_9_06', N'Sinh lý bơm khí ổ bụng', 4, 4),
        (6, N'ĐTLT_9_07', N'Gây mê trong PTNS', 8, 20),
        (7, N'ĐTLT_9_08', N'Kỹ thuật đặt trocart ổ bụng', 4, 20),
        (8, N'ĐTLT_9_09', N'Các thao tác cơ bản trong PTNS', 4, 20),
        (9, N'ĐTLT_9_10', N'Khâu và làm nút chỉ thắt trong PTNS', 4, 20),
        (10, N'ĐTLT_9_11', N'Sử dụng, bảo quản và tiệt trùng dụng cụ', 8, 8),
        (11, N'ĐTLT_9_12', N'Một số lỗi kỹ thuật hay gặp trong PTNS', 4, 8),
        (12, N'ĐTLT_9_13', N'Nội soi ổ bụng chẩn đoán', 8, 60),
        (13, N'ĐTLT_9_14', N'PTNS cắt ruột thừa', 4, 60),
        (14, N'ĐTLT_9_15', N'PTNS khâu lổ thủng dạ dày tá tràng', 8, 60),
        (15, N'ĐTLT_9_16', N'PTNS cắt túi mật', 4, 60),
        (16, N'ĐTLT_9_17', N'PTNS sỏi đường mật chính', 4, 28),
        (17, N'ĐTLT_9_18', N'PTNS Biến chứng của PTNS', 4, 0),
        (18, N'ĐTLT_9_19', N'PTNS hiện tại và xu hướng phát triển', 4, 0),
        (19, N'ĐTLT_9_20', N'Kiểm tra giữa khóa học.', 2, 2),
        (20, N'ĐTLT_9_21', N'Thi kết thúc khóa học', 4, 12),
        (21, N'ĐTLT_9_22', N'Tổng kết khóa học, nhận chứng chỉ', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_11: 14 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_11');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_11_01', N'Khai giảng, kiểm tra đầu vào', 0, 0),
        (1, N'ĐTLT_11_02', N'Đột quỵ não: Dịch tễ học, yếu tố nguy cơ, nguyên nhân, sinh lý bệnh', 4, 76),
        (2, N'ĐTLT_11_03', N'Kỹ thuật khám thần kinh và đánh giá các thang điểm đột quỵ', 4, 76),
        (3, N'ĐTLT_11_04', N'Giải phẫu mạch máu não, các hội chứng đột quỵ và định khu tổn thương', 4, 76),
        (4, N'ĐTLT_11_05', N'Chẩn đoán hình ảnh trong đột quỵ não', 4, 76),
        (5, N'ĐTLT_11_06', N'Tiếp cận chẩn đoán và xử trí ban đầu đột quỵ cấp, chẩn đoán phân biệt.', 4, 76),
        (6, N'ĐTLT_11_07', N'Chẩn đoán và xử trí đột quỵ thiếu máu não cấp', 4, 76),
        (7, N'ĐTLT_11_08', N'Chảy máu não: nguyên nhân, chẩn đoán, tiên lượng, điều trị, dự phòng', 4, 76),
        (8, N'ĐTLT_11_09', N'Chảy máu dưới nhện: nguyên nhân, chẩn đoán, tiên lượng, điều trị, dự phòng.', 4, 76),
        (9, N'ĐTLT_11_10', N'Huyết khối tĩnh mạch não: nguyên nhân, chẩn đoán, tiên lượng, điều trị, dự phòng', 4, 76),
        (10, N'ĐTLT_11_11', N'Chăm sóc người bệnh đột quy ở giai đoạn cấp: theo dõi và dự phòng biến chứng cấp, test nuốt, phòng ngừa huyết khối tĩnh mạch sâu, phục hồi chức năng.', 4, 76),
        (11, N'ĐTLT_11_12', N'Các kỹ thuật can thiệp nội mạch trong điều trị bệnh đột quỵ não', 4, 76),
        (12, N'ĐTLT_11_13', N'Ôn tập, giải đáp câu hỏi', 0, 0),
        (13, N'ĐTLT_11_14', N'Bế giảng, thi kết thúc khóa học', 0, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_12: 14 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_12');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_12_01', N'Khai giảng khóa đào tạo; Kiểm tra đầu vào.', 4, 0),
        (1, N'ĐTLT_12_02', N'Sinh lý tuần hoàn và sinh lý bệnh suy tim', 4, 8),
        (2, N'ĐTLT_12_03', N'Định nghĩa, phân độ và giai đoạn suy tim', 4, 8),
        (3, N'ĐTLT_12_04', N'Chẩn đoán và điều trị suy tim mạn tính', 4, 8),
        (4, N'ĐTLT_12_05', N'Chẩn đoán và điều trị Suy tim cấp', 4, 8),
        (5, N'ĐTLT_12_06', N'Vai trò của thiết bị hỗ trợ điều trị Suy tim', 4, 8),
        (6, N'ĐTLT_12_07', N'Cập nhật những tiến bộ mới trong Chẩn đoán và điều trị Suy tim', 6, 16),
        (7, N'ĐTLT_12_08', N'Bệnh mạch vành và suy tim: sinh lý bệnh, chẩn đoán, chiến lược điều trị và tiên lượng bệnh', 4, 8),
        (8, N'ĐTLT_12_09', N'Vai trò của ngoại khoa trong điều trị Suy tim (Phẫu thuật thay van, CABG, Ghép tim)', 4, 8),
        (9, N'ĐTLT_12_10', N'Suy tim ở người trưởng thành mắc tim bẩm sinh: chẩn đoán và chiến lược điều trị', 4, 8),
        (10, N'ĐTLT_12_11', N'Vai trò của các phương pháp đánh giá chức năng tim bằng siêu âm', 6, 16),
        (11, N'ĐTLT_12_12', N'Quản lý bệnh nhân suy tim: Các bệnh lý đi kèm và điều trị ngoại trú', 4, 8),
        (12, N'ĐTLT_12_13', N'Ôn tập', 4, 8),
        (13, N'ĐTLT_12_14', N'Kiểm tra cuối khóa', 4, 8);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_13: 17 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_13');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_13_01', N'Khai giảng khóa đào tạo. Kiểm tra đầu vào', 2, 4),
        (1, N'ĐTLT_13_02', N'Các khái niệm cơ bản về ĐTĐ; Hướng dẫn đọc một ĐTĐ', 4, 8),
        (2, N'ĐTLT_13_03', N'Phương pháp ghi ĐTĐ, hướng dẫn sử dụng máy điện tim', 4, 8),
        (3, N'ĐTLT_13_04', N'Phân tích hình dạng các sóng.', 6, 12),
        (4, N'ĐTLT_13_05', N'ĐTĐ trong chẩn đoán phì đại các buồng tim (dày nhĩ, dày thất…)', 4, 8),
        (5, N'ĐTLT_13_06', N'ĐTĐ trong chẩn đoán Hội chứng vành cấp', 6, 12),
        (6, N'ĐTLT_13_07', N'ĐTĐ trong chẩn đoán bệnh mạch vành ổn định', 6, 12),
        (7, N'ĐTLT_13_08', N'ĐTĐ trẻ em và trong một số bệnh tim bẩm sinh', 4, 8),
        (8, N'ĐTLT_13_09', N'Các rối loạn nhịp tim thường gặp trong thực hành lâm sàng', 6, 12),
        (9, N'ĐTLT_13_10', N'ĐTĐ trong chẩn đoán rối loạn nhịp tim chậm', 6, 12),
        (10, N'ĐTLT_13_11', N'Chẩn đoán và xử trí cơn nhịp nhanh kịch phát', 6, 12),
        (11, N'ĐTLT_13_12', N'ĐTĐ trong các bệnh lý van tim', 4, 8),
        (12, N'ĐTLT_13_13', N'ĐTĐ trong bệnh lý màng ngoài tim và rối loạn điện giải', 4, 8),
        (13, N'ĐTLT_13_14', N'Một số hội chứng bẩm sinh (Hội chứng Brugada, QT kéo dài, QT ngắn, Lown –Ganong – Levine, WPW,…)', 4, 8),
        (14, N'ĐTLT_13_15', N'ĐTĐ trong một số bệnh tim khác (THA, tâm phế mạn, thấp tim…)', 6, 12),
        (15, N'ĐTLT_13_16', N'Ôn tập', 6, 12),
        (16, N'ĐTLT_13_17', N'Kiểm tra cuối khóa', 2, 4);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_18: 25 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_18');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_18_01', N'Kiểm tra kiến thức đầu vào, khai giảng lớp học', 1, 0),
        (1, N'ĐTLT_18_02', N'Bài 1: Lịch sử và gây mê phẫu thuật', 1, 0),
        (2, N'ĐTLT_18_03', N'Bài 2: Thuốc mê đường hô hấp', 4, 0),
        (3, N'ĐTLT_18_04', N'Bài 3: Thuốc mê đường tĩnh mạch', 4, 0),
        (4, N'ĐTLT_18_05', N'Bài 4: Thuốc tê', 4, 0),
        (5, N'ĐTLT_18_06', N'Bài 5: Thuốc trợ tim và vận mạch trong gây mê hồi sức', 4, 0),
        (6, N'ĐTLT_18_07', N'Bài 6: Các loại dịch truyền trong gây mê hồi sức', 4, 0),
        (7, N'ĐTLT_18_08', N'Bài 7: Hệ thống gây mê hô hấp', 4, 2),
        (8, N'ĐTLT_18_09', N'Bài 8: Chuẩn bệnh nhân trước mổ', 4, 20),
        (9, N'ĐTLT_18_10', N'Bài 9: Theo dõi bệnh nhân trong gây mê', 4, 20),
        (10, N'ĐTLT_18_11', N'Bài 10: Triệu chứng gây mê và đánh giá độ mê', 4, 20),
        (11, N'ĐTLT_18_12', N'Bài 11:Đặt ống nội Khí quản trong gây mê hồi sức', 4, 40),
        (12, N'ĐTLT_18_13', N'Bài 12: Đặt Mask thanh quản', 4, 20),
        (13, N'ĐTLT_18_14', N'Bài 13: Gây mê toàn thân bằng đường tĩnh mạch', 4, 56),
        (14, N'ĐTLT_18_15', N'Bài 14: Gây mê cho bệnh nhân chấn thương sọ não', 4, 20),
        (15, N'ĐTLT_18_16', N'Bài 15: Biến chứng của gây mê', 4, 20),
        (16, N'ĐTLT_18_17', N'Bài 16: Gây tê tuỷ sống', 4, 56),
        (17, N'ĐTLT_18_18', N'Bài 17: Gây tê ngoài màng cứng', 4, 20),
        (18, N'ĐTLT_18_19', N'Bài 18: Gây tê đám rối thần kinh cánh tay', 4, 40),
        (19, N'ĐTLT_18_20', N'Bài 19: Gây tê vùng cho mổ lấy thai', 4, 20),
        (20, N'ĐTLT_18_21', N'Bài 20: Hồi sức ngừng tuần hoàn', 4, 10),
        (21, N'ĐTLT_18_22', N'Bài 21: Sốc phản vệ trong gây mê', 4, 10),
        (22, N'ĐTLT_18_23', N'Bài 22: Sốc chấn thương và xử trí cấp cứu', 4, 20),
        (23, N'ĐTLT_18_24', N'Bài 23: Truyền máu và các chế phẩm từ máu', 4, 20),
        (24, N'ĐTLT_18_25', N'Kiểm tra cuối khoá, bế giảng', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_19: 22 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_19');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_19_01', N'Bài 1: Lịch sử của nội soi phẫu thuật và gây mê nội soi', 2, 0),
        (1, N'ĐTLT_19_02', N'Bài 2: Kiểm tra kiến thức và khai giảng đầu vào', 2, 2),
        (2, N'ĐTLT_19_03', N'Bài 3: Cấu trúc, hoạt động của phòng mổ nội soi', 1, 1),
        (3, N'ĐTLT_19_04', N'Bài 4: Sinh lý của mổ nội soi ổ bụng', 4, 4),
        (4, N'ĐTLT_19_05', N'Bài 5: Chuyển hóa CO2 trong cơ thể và thán đồ', 4, 4),
        (5, N'ĐTLT_19_06', N'Bài 6: Các tư thế bệnh nhân trong phẫu thuật nội soi', 4, 4),
        (6, N'ĐTLT_19_07', N'Bài 7: Tắc mạch khí do CO2 trong mổ nội soi', 8, 0),
        (7, N'ĐTLT_19_08', N'Bài 8: Xử trí đặt nội khí quản khó', 4, 20),
        (8, N'ĐTLT_19_09', N'Bài 9: Gây mê hồi sức trong mổ nội soi ổ bụng', 8, 56),
        (9, N'ĐTLT_19_10', N'Bài 10: Chăm sóc và theo dõi các biến chứng sau mổ nội soi ổ bụng', 4, 20),
        (10, N'ĐTLT_19_11', N'Bài 11: Gây mê hồi sức cho nội soi trên phụ nữ có thai', 4, 20),
        (11, N'ĐTLT_19_12', N'Bài 12: Gây mê mổ nội soi cho bệnh nhân bệnh gan mật', 4, 32),
        (12, N'ĐTLT_19_13', N'Bài 13: Gây mê mổ nội soi trên bệnh nhân cao huyết áp', 4, 16),
        (13, N'ĐTLT_19_14', N'Bài 14: Gây mê nội soi cho bệnh nhân có bệnh phổi', 4, 16),
        (14, N'ĐTLT_19_15', N'Bài 15: Gây mê nội soi cho bệnh nhân béo phì', 4, 16),
        (15, N'ĐTLT_19_16', N'Bài 16: Gây mê mổ nội soi trên bênh nhân đái tháo đường', 4, 16),
        (16, N'ĐTLT_19_17', N'Bài 17: Gây mê mổ nội soi cho bệnh nhân có bệnh lý tim mạch, mạch vành', 4, 16),
        (17, N'ĐTLT_19_18', N'Bài 18: Gây mê mổ nội soi tai mũi họng', 4, 20),
        (18, N'ĐTLT_19_19', N'Bài 19: Gây mê cho mổ nội soi lồng ngực đơn giản', 4, 16),
        (19, N'ĐTLT_19_20', N'Bài 20: Kiểm tra giữa khóa học.', 2, 2),
        (20, N'ĐTLT_19_21', N'Bài 21: Thi kết thúc khóa học', 2, 8),
        (21, N'ĐTLT_19_22', N'Bài 22: Tổng kết khóa học, nhận chứng chỉ', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_23: 17 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_23');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_23_01', N'Các bộ phận máy nội soi và cách sử dụng, bảo quản', 4, 16),
        (1, N'ĐTLT_23_02', N'Đại cương Tai Mũi Họng', 8, 12),
        (2, N'ĐTLT_23_03', N'Cách khám nội soi Tai Mũi Họng', 4, 36),
        (3, N'ĐTLT_23_04', N'Giải phẫu Tai, Mũi, Họng', 4, 18),
        (4, N'ĐTLT_23_05', N'Sinh lý Tai, Mũi, Họng', 16, 8),
        (5, N'ĐTLT_23_06', N'Hình ảnh nội soi vòm mũi họng', 4, 20),
        (6, N'ĐTLT_23_07', N'Hình ảnh bình thường trong thăm khám nội soi hốc mũi', 4, 20),
        (7, N'ĐTLT_23_08', N'U lành tính vòm, mũi xoang', 4, 20),
        (8, N'ĐTLT_23_09', N'Các khối u ác tính ở vòm mũi họng, mũi xoang', 4, 20),
        (9, N'ĐTLT_23_10', N'Dị hình khe giữa', 4, 20),
        (10, N'ĐTLT_23_11', N'Dị hình vách ngăn', 4, 20),
        (11, N'ĐTLT_23_12', N'Hình ảnh bình thường trong thăm khám nội soi tai', 4, 20),
        (12, N'ĐTLT_23_13', N'Hình ảnh bệnh lý trong thăm khám nội soi tai', 4, 20),
        (13, N'ĐTLT_23_14', N'Hình ảnh bình thường trong thăm khám nội soi họng thanh quản', 4, 20),
        (14, N'ĐTLT_23_15', N'Hình ảnh bệnh lý trong thăm khám nội soi họng thanh quản', 4, 20),
        (15, N'ĐTLT_23_16', N'Các khối u lành và ác tính ở họng thanh quản', 4, 20),
        (16, N'ĐTLT_23_17', N'Tổng kết khóa học, nhận chứng chỉ', 8, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_24: 8 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_24');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_24_01', N'Giải phẫu vùng đầu mặt cổ', 4, 4),
        (1, N'ĐTLT_24_02', N'Các dụng cụ mở khí quản', 4, 4),
        (2, N'ĐTLT_24_03', N'Chỉ định mở khí quản', 4, 4),
        (3, N'ĐTLT_24_04', N'Phương pháp mở khí quản', 4, 4),
        (4, N'ĐTLT_24_05', N'Kiến tập trên bệnh nhân mở khí quản', 4, 16),
        (5, N'ĐTLT_24_06', N'Thực hành mở khí quản', 4, 36),
        (6, N'ĐTLT_24_07', N'Cách chăm sóc và theo dõi sau mở khí quản', 4, 16),
        (7, N'ĐTLT_24_08', N'Xử trí các tai biến sau mở khí quản', 4, 12);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_25: 22 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_25');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_25_01', N'Bài 1: Dụng cụ Tai Mũi Họng, cách sử dụng và bảo quản.', 4, 12),
        (1, N'ĐTLT_25_02', N'Bài 2: Các bộ phận máy nội soi và cách sử dụng, bảo quản.', 4, 12),
        (2, N'ĐTLT_25_03', N'Bài 3: Sơ lược giải phẫu, sinh lý Tai, Mũi, Họng', 4, 16),
        (3, N'ĐTLT_25_04', N'Bài 4: Các thủ thuật Tai Mũi Họng', 12, 0),
        (4, N'ĐTLT_25_05', N'Bài 5: Thay băng Tai, Mũi, Họng', 4, 20),
        (5, N'ĐTLT_25_06', N'Bài 6: Nhận biết một số hình ảnh bình thường, bất thường Tai Mũi Họng', 4, 16),
        (6, N'ĐTLT_25_07', N'Bài 7: Các bệnh cấp cứu Tai Mũi Họng', 4, 30),
        (7, N'ĐTLT_25_08', N'Bài 8: Chấn thương trong Tai Mũi Họng', 4, 16),
        (8, N'ĐTLT_25_09', N'Bài 9: Chăm sóc người bệnh chảy máu mũi', 4, 16),
        (9, N'ĐTLT_25_10', N'Bài 10: Chăm sóc người bệnh dị vật đường thở', 4, 4),
        (10, N'ĐTLT_25_11', N'Bài 11: Chăm sóc người bệnh dị vật đường ăn', 4, 24),
        (11, N'ĐTLT_25_12', N'Bài 12: Chăm sóc người bệnh viêm họng, viêm Amydal, viêm VA', 4, 24),
        (12, N'ĐTLT_25_13', N'Bài 13: Chăm sóc người bệnh viêm mũi xoang', 4, 12),
        (13, N'ĐTLT_25_14', N'Bài 14: Chăm sóc người bệnh viêm thanh quản', 4, 8),
        (14, N'ĐTLT_25_15', N'Bài 15: Chăm sóc người bệnh viêm tai giữa', 4, 24),
        (15, N'ĐTLT_25_16', N'Bài 16: Chăm sóc người bệnh sau chấn thương vùng Tai Mũi Họng', 4, 20),
        (16, N'ĐTLT_25_17', N'Bài 17: Chăm sóc người bệnh sau mổ tai', 4, 24),
        (17, N'ĐTLT_25_18', N'Bài 18: Chăm sóc người bệnh sau mổ mũi xoang', 4, 24),
        (18, N'ĐTLT_25_19', N'Bài 19: Chăm sóc người bệnh sau mổ họng thanh quản', 4, 30),
        (19, N'ĐTLT_25_20', N'Bài 20: Chăm sóc người bệnh sau căt Amydal, nạo VA', 4, 24),
        (20, N'ĐTLT_25_21', N'Ôn tập, kiểm tra, đánh giá', 4, 4),
        (21, N'ĐTLT_25_22', N'Khai giảng/bế giảng', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_26: 7 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_26');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_26_01', N'Bài 1: Chữa răng', 20, 130),
        (1, N'ĐTLT_26_02', N'Bài 2: Nhổ răng', 12, 116),
        (2, N'ĐTLT_26_03', N'Bài 3: Hàm mặt', 4, 46),
        (3, N'ĐTLT_26_04', N'Bài 4: Nha cộng đồng', 4, 14),
        (4, N'ĐTLT_26_05', N'Bài 5: Nha chu', 8, 46),
        (5, N'ĐTLT_26_06', N'Ôn tập, kiểm tra, đánh giá', 0, 0),
        (6, N'ĐTLT_26_07', N'Khai giảng/bế giảng', 0, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_28: 33 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_28');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_28_01', N'Khai giảng, kiểm tra đầu vào', 4, 0),
        (1, N'ĐTLT_28_02', N'Bài 1. Đánh giá và xử trí ban đầu bệnh nhân cấp cứu.', 4, 16),
        (2, N'ĐTLT_28_03', N'Bài 2. Nhận định và phân loại bệnh nhân cấp cứu', 4, 16),
        (3, N'ĐTLT_28_04', N'Bài 3. Nhận định và xử trí cấp cứu ban đầu bệnh nhân chấn thương.', 4, 16),
        (4, N'ĐTLT_28_05', N'Bài 4. Tư thế an toàn và vận chuyển bệnh nhân cấp cứu.', 4, 16),
        (5, N'ĐTLT_28_06', N'Bài 5. Cấp cứu bệnh nhân ngừng tuần hoàn.', 4, 16),
        (6, N'ĐTLT_28_07', N'Bài 6. Cấp cứu phản vệ và chăm sóc bệnh nhân phản vệ.', 4, 16),
        (7, N'ĐTLT_28_08', N'Bài 7. Chăm sóc bệnh nhân suy hô hấp cấp', 4, 16),
        (8, N'ĐTLT_28_09', N'Bài 8. Chăm sóc bệnh nhân nhồi máu cơ tim cấp.', 4, 16),
        (9, N'ĐTLT_28_10', N'Bài 9. Chăm sóc bệnh nhân hôn mê.', 4, 16),
        (10, N'ĐTLT_28_11', N'Bài 10. Chăm sóc bệnh nhân xuất huyết tiêu hóa cao.', 4, 16),
        (11, N'ĐTLT_28_12', N'Bài 11. Chăm sóc bệnh nhân đột quị não.', 4, 16),
        (12, N'ĐTLT_28_13', N'Bài 12. Chăm sóc bệnh nhân ngộ độc cấp.', 4, 16),
        (13, N'ĐTLT_28_14', N'Bài 13. Chăm sóc bệnh nhân bỏng.', 4, 16),
        (14, N'ĐTLT_28_15', N'Bài 14. Chăm sóc bệnh nhân đặt nội khí quản, canyl mở khí quản.', 2, 16),
        (15, N'ĐTLT_28_16', N'Bài 15. Chăm sóc bệnh nhân thở máy.', 2, 16),
        (16, N'ĐTLT_28_17', N'Bài 16. Chăm sóc bệnh nhân đặt catheter tĩnh mạch trung tâm.', 2, 16),
        (17, N'ĐTLT_28_18', N'Bài 17. Kỹ thuật thở oxy cho bệnh nhân.', 2, 16),
        (18, N'ĐTLT_28_19', N'Bài 18. Các kỹ thuật khai thông đường thở.', 2, 16),
        (19, N'ĐTLT_28_20', N'Bài 19. Sốc điện cấp cứu.', 2, 16),
        (20, N'ĐTLT_28_21', N'Bài 20. Kỹ thuật hút đờm.', 2, 16),
        (21, N'ĐTLT_28_22', N'Bài 21. Liệu pháp khí dung.', 2, 12),
        (22, N'ĐTLT_28_23', N'Bài 22. Kỹ thuật đặt sonde dạ dày.', 2, 16),
        (23, N'ĐTLT_28_24', N'Bài 23. Kỹ thuật đặt sonde tiểu.', 2, 16),
        (24, N'ĐTLT_28_25', N'Bài 24. Kỹ thuật lấy máu làm xét nghiệm khí máu.', 2, 12),
        (25, N'ĐTLT_28_26', N'Bài 25. Kỹ thuật ghi điện tim cấp cứu.', 2, 12),
        (26, N'ĐTLT_28_27', N'Bài 26. Sử dụng bơm tiêm điện.', 2, 12),
        (27, N'ĐTLT_28_28', N'Bài 27. Sử dụng máy truyền dịch.', 2, 12),
        (28, N'ĐTLT_28_29', N'Bài 28. Sử dụng Monitor theo dõi.', 2, 12),
        (29, N'ĐTLT_28_30', N'Bài 29. Kỹ thuật cố định xương gãy.', 2, 16),
        (30, N'ĐTLT_28_31', N'Kiểm tra giữa khóa học', 2, 2),
        (31, N'ĐTLT_28_32', N'Thi kết thúc học phần', 2, 7),
        (32, N'ĐTLT_28_33', N'Tổng kết khóa học và nhận chứng chỉ', 2, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_32: 1 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_32');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_32_01', N'Bài 1: Cấp cứu ngừng tuần hoàn', 10, 30);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_37: 4 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_37');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_37_01', N'Bài 1: Quy trình khử khuẩn và bảo quản ống nội soi phế quản mềm', 4, 20),
        (1, N'ĐTLT_37_02', N'Bài 2: Quy trình kỹ thuật nội soi phế quản ống mềm.', 8, 96),
        (2, N'ĐTLT_37_03', N'Bài 3: Một số kỹ thuật cơ bản chẩn đoán và điều trị qua nội soi phế quản ống mềm', 8, 160),
        (3, N'ĐTLT_37_04', N'Ôn tập, kiểm tra, đánh giá', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_38: 6 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_38');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_38_01', N'Tổng quan về theo dõi và chăm sóc bệnh nhân sau mổ.', 40, 38),
        (1, N'ĐTLT_38_02', N'Chăm sóc bệnh nhân sau mổ sọ não', 40, 38),
        (2, N'ĐTLT_38_03', N'Chăm sóc bệnh nhân sau mổ tiêu hóa , gan mật', 40, 38),
        (3, N'ĐTLT_38_04', N'Chăm sóc bệnh nhân dẫn lưu màng phổi', 40, 38),
        (4, N'ĐTLT_38_05', N'Chăm sóc dinh dưỡng và hồi phục chức năng', 40, 38),
        (5, N'ĐTLT_38_06', N'Tổng kết & nâng cao kỹ năng giao tiếp – xử trí cấp cứu', 40, 38);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_39: 14 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_39');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_39_01', N'Tổng quan về máy thở', 8, 24),
        (1, N'ĐTLT_39_02', N'Thiết lập thông số máy thở cơ bản', 8, 24),
        (2, N'ĐTLT_39_03', N'Đọc và ghi nhận thông số trên máy thở', 8, 24),
        (3, N'ĐTLT_39_04', N'Báo động trên máy thở, nguyên nhân và xử trí', 8, 24),
        (4, N'ĐTLT_39_05', N'Chăm sóc bệnh nhân thở máy', 8, 24),
        (5, N'ĐTLT_39_06', N'Chăm sóc ống NKQ/MKQ', 8, 24),
        (6, N'ĐTLT_39_07', N'Hút đờm qua ống NKQ/MKQ', 8, 24),
        (7, N'ĐTLT_39_08', N'Dinh dưỡng, phòng loét cho BN thở máy', 8, 24),
        (8, N'ĐTLT_39_09', N'Vệ sinh răng miệng', 8, 24),
        (9, N'ĐTLT_39_10', N'Biến chứng thường gặp', 8, 24),
        (10, N'ĐTLT_39_11', N'Giao tiếp – hỗ trợ tâm lý cho bệnh nhân thở máy; Quản lý đau, lo lắng và delirium', 8, 24),
        (11, N'ĐTLT_39_12', N'Chuyển giường, vận chuyển bệnh nhân thở máy', 8, 24),
        (12, N'ĐTLT_39_13', N'Quản lý kết thúc thở máy – weaning và rút ống nội khí quản', 8, 24),
        (13, N'ĐTLT_39_14', N'Tổng kết kiến thức và kỹ năng chuyên môn', 8, 24);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_40: 13 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_40');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_40_01', N'Bài 1: Đại cương về thông khí nhân tạo', 16, 36),
        (1, N'ĐTLT_40_02', N'Bài 2: Cấu tạo, nguyên lý máy thở và giải phẫu sinh lý hô hấp liên quan thở máy', 16, 36),
        (2, N'ĐTLT_40_03', N'Bài 3: Phương thức thở máy cơ bản', 8, 24),
        (3, N'ĐTLT_40_04', N'Bài 4: Cài đặt thở máy ban đầu', 8, 36),
        (4, N'ĐTLT_40_05', N'Bài 5: Cai thở máy', 8, 36),
        (5, N'ĐTLT_40_06', N'Bài 6: Thông khí nhân tạo không xâm nhập', 8, 36),
        (6, N'ĐTLT_40_07', N'Bài 7: Thông khí oxy dòng cao', 8, 36),
        (7, N'ĐTLT_40_08', N'Bài 7: Sử dụng thuốc chống đông trong lọc máu hấp phụ', 8, 36),
        (8, N'ĐTLT_40_09', N'Bài 8: Một số phương thức thở nâng cao', 8, 36),
        (9, N'ĐTLT_40_10', N'Bài 9: Thông khí nhân tạo ở bệnh nhân ARDS', 8, 42),
        (10, N'ĐTLT_40_11', N'Bài 10: Huy động phế nang', 4, 36),
        (11, N'ĐTLT_40_12', N'Bài 11: Ôn tập, thi kết thúc khóa học', 8, 24),
        (12, N'ĐTLT_40_13', N'Bài 12: Tổng kết khóa học, nhận chứng chỉ', 0, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_42: 11 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_42');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_42_01', N'Bài 1: Chẩn đoán và điều trị viêm khớp dạng thấp', 6, 48),
        (1, N'ĐTLT_42_02', N'Bài 2: Chẩn đoán và điều trị thoái hóa khớp', 6, 48),
        (2, N'ĐTLT_42_03', N'Bài 3: Chẩn đoán và điều trị bệnh gút', 6, 48),
        (3, N'ĐTLT_42_04', N'Bài 4: Chẩn đoán và điều trị loãng xương', 6, 48),
        (4, N'ĐTLT_42_05', N'Bài 5: Chẩn đoán và điều trị Lupus ban đỏ hệ thống', 6, 48),
        (5, N'ĐTLT_42_06', N'Bài 6: Chẩn đoán và điều trị viêm đa cơ', 6, 48),
        (6, N'ĐTLT_42_07', N'Bài 7: Chẩn đoán và điều trị đau thần kinh tọa', 6, 48),
        (7, N'ĐTLT_42_08', N'Bài 8: Chẩn đoán và điều trị xơ cứng bì toàn thể', 6, 48),
        (8, N'ĐTLT_42_09', N'Bài 9: Chẩn đoán và điều trị nhiễm khuẩn cơ xương khớp', 6, 36),
        (9, N'ĐTLT_42_10', N'Bài 10: Chẩn đoán và điều trị viêm cột sống dính khớp', 6, 36),
        (10, N'ĐTLT_42_11', N'Ôn tập, kiểm tra', 6, 6);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_45: 15 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_45');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_45_01', N'Giải phẫu, sinh lý hệ thống gan mật', 4, 0),
        (1, N'ĐTLT_45_02', N'Các bệnh lý ngoại khoa gan mật thường gặp', 4, 0),
        (2, N'ĐTLT_45_03', N'Đại cương phẫu thuật gan mật, phẫu thuật nội soi', 4, 0),
        (3, N'ĐTLT_45_04', N'Phương tiện + dụng cụ phẫu thuật; Sử dụng, bảo quản máy móc, dụng cụ', 4, 0),
        (4, N'ĐTLT_45_05', N'Kỹ thuật cơ bản trong phẫu thuật gan mật', 4, 0),
        (5, N'ĐTLT_45_06', N'Cắt túi mật', 4, 0),
        (6, N'ĐTLT_45_07', N'Cắt chỏm nang gan – lách', 4, 0),
        (7, N'ĐTLT_45_08', N'Mở ống mật chủ, lấy sỏi, dẫn lưu Kehr', 4, 0),
        (8, N'ĐTLT_45_09', N'Điều trị ngoại khoa áp xe gan', 4, 0),
        (9, N'ĐTLT_45_10', N'Nối mật ruột', 4, 0),
        (10, N'ĐTLT_45_11', N'Các thủ thuật: chọc hút/dẫn lưu nang/áp xe gan; sinh thiết gan', 8, 0),
        (11, N'ĐTLT_45_12', N'Giới thiệu máy và dụng cụ phẫu thuật', 0, 4),
        (12, N'ĐTLT_45_13', N'Giới thiệu kỹ thuật cơ bản', 0, 8),
        (13, N'ĐTLT_45_14', N'Thực hành dụng cụ, thao tác cơ bản trên mô hình (nội soi)', 0, 8),
        (14, N'ĐTLT_45_15', N'Tham gia đi lâm sàng, phụ mổ', 0, 350);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_49: 7 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_49');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_49_01', N'Đại cương về xoa bóp bấm huyệt.', 16, 0),
        (1, N'ĐTLT_49_02', N'Các thủ thuật chính của xoa bóp bấm huyệt.', 32, 64),
        (2, N'ĐTLT_49_03', N'Xoa bóp từng bộ phận', 76, 60),
        (3, N'ĐTLT_49_04', N'Xoa bóp điều trị một số chứng bệnh thông thường', 56, 112),
        (4, N'ĐTLT_49_05', N'Một số đặc điểm cần chú ý khi chữa bệnh bằng xoa bóp bấm huyệt.', 48, 0),
        (5, N'ĐTLT_49_06', N'Kiểm tra trước và kết thúc khóa học.', 0, 16),
        (6, N'ĐTLT_49_07', N'Khai mạc, bế mạc', 0, 16);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_50: 7 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_50');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_50_01', N'Bài 1: Đại cương về châm cứu.', 24, 16),
        (1, N'ĐTLT_50_02', N'Bài 2: Cơ chế tác dụng của phương pháp châm cứu', 12, 12),
        (2, N'ĐTLT_50_03', N'Bài 3: Đại cương về huyệt và các đường kinh', 32, 32),
        (3, N'ĐTLT_50_04', N'Bài 4: Quy trình kỹ thuật châm cứu và điện châm.', 16, 24),
        (4, N'ĐTLT_50_05', N'Bài 5: Áp dụng phương pháp châm cứu điều trị một số bệnh hay gặp:', 96, 192),
        (5, N'ĐTLT_50_06', N'Bài 6: Kiểm tra trước và kết thúc khóa học.', 0, 16),
        (6, N'ĐTLT_50_07', N'Bài 7: Khai mạc, bế mạc', 0, 16);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_52: 17 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_52');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_52_01', N'Khai giảng, kiểm tra đầu vào.', 4, 4),
        (1, N'ĐTLT_52_02', N'Bệnh viêm gan cấp tính', 8, 24),
        (2, N'ĐTLT_52_03', N'Các virus gây viêm gan', 8, 20),
        (3, N'ĐTLT_52_04', N'Bệnh viêm gan virus A', 8, 20),
        (4, N'ĐTLT_52_05', N'Bệnh viêm gan virus B', 8, 28),
        (5, N'ĐTLT_52_06', N'Bệnh viêm gan virus C', 8, 28),
        (6, N'ĐTLT_52_07', N'Bệnh viêm gan virus D', 4, 16),
        (7, N'ĐTLT_52_08', N'Bệnh viêm gan virus E', 4, 16),
        (8, N'ĐTLT_52_09', N'Bệnh viêm gan do thuốc.', 8, 28),
        (9, N'ĐTLT_52_10', N'Bệnh viêm gan tự miễn.', 4, 16),
        (10, N'ĐTLT_52_11', N'Bệnh viêm gan mạn tính.', 8, 28),
        (11, N'ĐTLT_52_12', N'Bệnh viêm gan ác tính.', 8, 28),
        (12, N'ĐTLT_52_13', N'Các nhóm thuốc điều trị viêm gan virus', 4, 16),
        (13, N'ĐTLT_52_14', N'Kiểm tra giữa khóa học', 4, 4),
        (14, N'ĐTLT_52_15', N'Ôn tập', 4, 16),
        (15, N'ĐTLT_52_16', N'Kiểm tra đánh giá kết thúc', 4, 8),
        (16, N'ĐTLT_52_17', N'Tổng kết phát chứng chỉ', 4, 4);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_53: 6 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_53');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_53_01', N'Bài 1: Nguyên tắc cơ bản; chỉ định và chống chỉ định; tai biến tiêm khớp', 24, 84),
        (1, N'ĐTLT_53_02', N'Bài 2: Hút dịch và tiêm khớp gối', 24, 84),
        (2, N'ĐTLT_53_03', N'Bài 3: Tiêm khớp vai (Tiêm gân nhị đầu, Tiêm gân trên gai)', 24, 84),
        (3, N'ĐTLT_53_04', N'Bài 4: Tiêm khớp khuỷu', 24, 84),
        (4, N'ĐTLT_53_05', N'Bài 5: Tiêm các điểm bám tận (Tiêm điểm bám gân lồi cầu, lồi cầu ngoài khớp gối, xương cánh tay)', 24, 60),
        (5, N'ĐTLT_53_06', N'Ôn tập, kiểm tra, đánh giá', 8, 20);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_54: 23 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_54');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_54_01', N'Khai giảng, kiểm tra đầu vào', 4, 0),
        (1, N'ĐTLT_54_02', N'Tiếp cận bệnh nhân đau bụng cấp', 5, 20),
        (2, N'ĐTLT_54_03', N'Tiếp cận bệnh nhân vàng da', 5, 20),
        (3, N'ĐTLT_54_04', N'Tiếp cận tiêu chảy', 5, 20),
        (4, N'ĐTLT_54_05', N'Hướng dẫn chẩn đoán và điều trị bệnh trào ngược dạ dày - thực quản (GERD)', 5, 15),
        (5, N'ĐTLT_54_06', N'Hướng dẫn chẩn đoán và điều trị Helicobacter Pylori', 5, 15),
        (6, N'ĐTLT_54_07', N'Hướng dẫn chẩn đoán và điều trị loét dạ dày tá tràng', 5, 15),
        (7, N'ĐTLT_54_08', N'Chảy máu tiêu hóa thấp', 5, 20),
        (8, N'ĐTLT_54_09', N'Chảy máu tiêu hóa trên do tăng áp lực tĩnh mạch cửa', 5, 20),
        (9, N'ĐTLT_54_10', N'Chảy máu tiêu hóa trên do loét dạ dày – tá tràng', 5, 20),
        (10, N'ĐTLT_54_11', N'Xơ gan', 5, 20),
        (11, N'ĐTLT_54_12', N'Ung thư biểu mô tế bào gan', 5, 20),
        (12, N'ĐTLT_54_13', N'Viêm tụy cấp', 5, 20),
        (13, N'ĐTLT_54_14', N'Viêm gan virus B', 5, 20),
        (14, N'ĐTLT_54_15', N'Viêm gan virus C', 5, 20),
        (15, N'ĐTLT_54_16', N'Bệnh gan do rượu', 5, 20),
        (16, N'ĐTLT_54_17', N'Hướng dẫn chẩn đoán và điều trị táo bón', 10, 15),
        (17, N'ĐTLT_54_18', N'Hội chứng ruột kích thích', 10, 15),
        (18, N'ĐTLT_54_19', N'Viêm loét đại trực tràng chảy máu', 10, 15),
        (19, N'ĐTLT_54_20', N'Bệnh Crohn', 10, 15),
        (20, N'ĐTLT_54_21', N'Kiểm tra giữa khóa học.', 4, 0),
        (21, N'ĐTLT_54_22', N'Thi kết thúc khóa học', 4, 8),
        (22, N'ĐTLT_54_23', N'Tổng kết khóa học, nhận chứng chỉ', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_55: 20 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_55');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_55_01', N'Khai giảng, kiểm tra đầu vào', 0, 0),
        (1, N'ĐTLT_55_02', N'Thiếu máu: Chẩn đoán, xếp loại và xử trí', 0, 0),
        (2, N'ĐTLT_55_03', N'Thiếu máu thiếu sắt: Chẩn đoán và hướng xử trí', 0, 0),
        (3, N'ĐTLT_55_04', N'Tan máu tự miễn: Chẩn đoán và điều trị', 0, 0),
        (4, N'ĐTLT_55_05', N'Xuất huyết giảm tiểu cầu miễn dịch', 0, 0),
        (5, N'ĐTLT_55_06', N'Thalassemia: Chẩn đoán và điều trị', 0, 0),
        (6, N'ĐTLT_55_07', N'Quy trình truyền máu lâm sàng', 0, 0),
        (7, N'ĐTLT_55_08', N'Chỉ định sử dụng máu và chế phẩm máu trong lâm sàng', 0, 0),
        (8, N'ĐTLT_55_09', N'Lơ xê mi cấp: Chẩn đoán, phân loại và hướng xử trí', 0, 0),
        (9, N'ĐTLT_55_10', N'U lympho Hodgkin và không Hodgkin', 0, 0),
        (10, N'ĐTLT_55_11', N'Đa u tủy xương: Chẩn đoán và hướng xử trí', 0, 0),
        (11, N'ĐTLT_55_12', N'Chỉ định gạn tách các thành phần máu trong điều trị', 0, 0),
        (12, N'ĐTLT_55_13', N'Đa hồng cầu: Chẩn đoán và điều trị', 0, 0),
        (13, N'ĐTLT_55_14', N'Tăng tiểu cầu tiên phát: Chẩn đoán và điều trị', 0, 0),
        (14, N'ĐTLT_55_15', N'Lơ xê mi kinh: Chẩn đoán, phân loại và hướng xử trí', 0, 0),
        (15, N'ĐTLT_55_16', N'Rối loạn sinh tủy: Chẩn đoán và hướng xử trí', 0, 0),
        (16, N'ĐTLT_55_17', N'Hemophia: Chẩn đoán và điều trị', 0, 0),
        (17, N'ĐTLT_55_18', N'Kiểm tra giữa khóa học', 0, 0),
        (18, N'ĐTLT_55_19', N'Thi kết thúc khóa học', 0, 0),
        (19, N'ĐTLT_55_20', N'Tổng kết khóa học, nhận chứng chỉ', 0, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_56: 13 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_56');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_56_01', N'Khai giảng, kiểm tra đầu vào', 4, 0),
        (1, N'ĐTLT_56_02', N'Bài 1: Nguyên tắc vô khuẩn trong ngoại khoa', 2, 0),
        (2, N'ĐTLT_56_03', N'Bài 2: Nguyên lý cấu tạo và cách sử dụng máy thở', 2, 4),
        (3, N'ĐTLT_56_04', N'Bài 3: Tác dụng dược lực học, dược động học các thuốc trong gây mê hồi sức', 20, 4),
        (4, N'ĐTLT_56_05', N'Bài 4: Theo dõi lâm sàng trong gây mê, các hệ thống máy mê', 4, 72),
        (5, N'ĐTLT_56_06', N'Bài 5: Quy trình gây mê nội khí quản', 4, 8),
        (6, N'ĐTLT_56_07', N'Bài 6: Các phương pháp giảm đau sau mổ', 4, 36),
        (7, N'ĐTLT_56_08', N'Bài 7: Các phương pháp gây mê', 4, 72),
        (8, N'ĐTLT_56_09', N'Bài 8: Các phương pháp gây gây tê', 4, 72),
        (9, N'ĐTLT_56_10', N'Bài 9: Gây mê hồi sức trẻ em; Bài 10: Gây mê hồi sức trong mổ sọ não; Bài 11: Gây mê trong mổ bụng cấp cứu; Bài 12: Các kỹ thuật vô cảm cho mổ lấy thai; Bài 13: Quy trình cấp cứu ngừng tuần hoàn', 10, 158),
        (10, N'ĐTLT_56_11', N'Kiểm tra giữa khóa học', 2, 6),
        (11, N'ĐTLT_56_12', N'Thi kết thúc khóa học', 4, 8),
        (12, N'ĐTLT_56_13', N'Tổng kế khóa học, nhận chứng chỉ', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_57: 13 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_57');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_57_01', N'Bài 1: Nguyên tắc vô khuẩn trong ngoại khoa', 4, 4),
        (1, N'ĐTLT_57_02', N'Bài 2: Nhiệm vụ sửa soạn phòng mổ cho cuộc phẫu thuật', 10, 4),
        (2, N'ĐTLT_57_03', N'Bài 3: Chuẩn bị cho một ca mổ', 4, 4),
        (3, N'ĐTLT_57_04', N'Bài 4: Kỹ thuật rửa tay vô khuẩn', 4, 4),
        (4, N'ĐTLT_57_05', N'Bài 5: Kỹ thuật mặc áo choàng phẫu thuật', 4, 8),
        (5, N'ĐTLT_57_06', N'Bài 6: Kỹ thuật mang gants vô khuẩn', 4, 8),
        (6, N'ĐTLT_57_07', N'Bài 7: Kỹ thuật trải champs cho các phẫu thuật', 4, 8),
        (7, N'ĐTLT_57_08', N'Bài 8: Tính năng của khác dụng cụ phẫu thuật cơ bản', 8, 24),
        (8, N'ĐTLT_57_09', N'Bài 9: Thực hiện các quy trình phụ dụng cụ cho từng phẫu thuật', 60, 160),
        (9, N'ĐTLT_57_10', N'Bài 10: Phối hợp với phẫu thuật viên trước, trong và sau mổ', 10, 36),
        (10, N'ĐTLT_57_11', N'Bài 11: Kiểm tra giữa khóa học', 6, 6),
        (11, N'ĐTLT_57_12', N'Bài 12: Thi kết thúc khóa học', 4, 8),
        (12, N'ĐTLT_57_13', N'Bài 13: Tổng kết khóa học, nhận chứng chỉ', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_63: 12 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_63');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_63_01', N'Khai giảng, kiểm tra đầu vào', 0, 0),
        (1, N'ĐTLT_63_02', N'Bài 1: Chẩn đoán Nhồi máu não cấp', 8, 32),
        (2, N'ĐTLT_63_03', N'Bài 2: Một số thang điểm thường dùng trên người bệnh Đột quỵ não', 8, 32),
        (3, N'ĐTLT_63_04', N'Bài 3: Chẩn đoán hình ảnh học trong Nhồi máu não cấp', 8, 32),
        (4, N'ĐTLT_63_05', N'Bài 4: Các phương pháp điều trị Đột quỵ não', 8, 32),
        (5, N'ĐTLT_63_06', N'Bài 5: Điều trị tiêu sợi huyết tĩnh mạch ở bệnh nhân Nhồi máu não cấp', 8, 32),
        (6, N'ĐTLT_63_07', N'Bài 6: Chỉ định và chống chỉ định của điều trị thuốc tiêu sợi huyết tĩnh mạch trong Nhồi máu não cấp', 8, 32),
        (7, N'ĐTLT_63_08', N'Bài 7: Theo dõi và chăm sóc người bệnh Đột quỵ não trong giai đoạn cấp', 8, 32),
        (8, N'ĐTLT_63_09', N'Bài 8: Chăm sóc người bệnh sau điều trị tiêu sợi huyết tĩnh mạch', 8, 32),
        (9, N'ĐTLT_63_10', N'Bài 9: Thực hành quy trình kỹ thuật điều trị tiêu sợi huyết trong nhồi máu não cấp', 8, 32),
        (10, N'ĐTLT_63_11', N'Ôn tập, giải đáp câu hỏi', 0, 0),
        (11, N'ĐTLT_63_12', N'Ôn tập, giải đáp câu hỏi', 0, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_64: 59 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_64');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_64_01', N'Bài 1: PHCN và các khái niệm cơ bản', 4, 0),
        (1, N'ĐTLT_64_02', N'Bài 2: Lượng giá người khuyết tật', 4, 12),
        (2, N'ĐTLT_64_03', N'Bài 3: Thử cơ bằng tay và đo tầm vận động khớp', 8, 16),
        (3, N'ĐTLT_64_04', N'Bài 4: Lượng giá chức năng tâm lý', 4, 12),
        (4, N'ĐTLT_64_05', N'Bài 5: Lượng giá chức năng ngôn ngữ', 4, 12),
        (5, N'ĐTLT_64_06', N'Bài 6: Lượng giá chức năng sinh hoạt hàng ngày', 4, 12),
        (6, N'ĐTLT_64_07', N'Bài 7: Tập vận động thụ động', 4, 16),
        (7, N'ĐTLT_64_08', N'Bài 8: Tập vận động có trợ giúp', 4, 16),
        (8, N'ĐTLT_64_09', N'Bài 9: Tập vận động chủ động', 4, 16),
        (9, N'ĐTLT_64_10', N'Bài 10: Tập vận động có kháng trở', 4, 16),
        (10, N'ĐTLT_64_11', N'Bài 11: Kỹ thuật vỗ, rung lồng ngực', 4, 16),
        (11, N'ĐTLT_64_12', N'Bài 12: Kỹ thuật dẫn lưu tư thế', 4, 16),
        (12, N'ĐTLT_64_13', N'Bài 13: Kỹ thuật xoa bóp', 4, 16),
        (13, N'ĐTLT_64_14', N'Bài 14: Điều trị bằng các dòng điện xung', 4, 12),
        (14, N'ĐTLT_64_15', N'Bài 15: Điều trị bằng tia hồng ngoại', 4, 12),
        (15, N'ĐTLT_64_16', N'Bài 16: Điều trị bằng parafin', 4, 12),
        (16, N'ĐTLT_64_17', N'Bài 17: Điều trị bằng sóng ngắn, sóng cực ngắn', 4, 12),
        (17, N'ĐTLT_64_18', N'Bài 18: Điều trị bằng vi sóng', 4, 12),
        (18, N'ĐTLT_64_19', N'Bài 19: Điều trị bằng siêu âm', 4, 8),
        (19, N'ĐTLT_64_20', N'Bài 20: Điều trị bằng máy kéo giãn cột sống', 4, 12),
        (20, N'ĐTLT_64_21', N'Bài 21: Kỹ thuật tập sử dụng và điều khiển xe lăn', 4, 12),
        (21, N'ĐTLT_64_22', N'Bài 22: Tập các chức năng sinh hoạt hàng ngày', 4, 12),
        (22, N'ĐTLT_64_23', N'Bài 23: Tập nuốt', 4, 16),
        (23, N'ĐTLT_64_24', N'Bài 24: Tập giao tiếp', 4, 16),
        (24, N'ĐTLT_64_25', N'Bài 25: Tập sửa lỗi phát âm', 4, 16),
        (25, N'ĐTLT_64_26', N'Bài 26: PHCN chấn thương chi trên -PHCN gãy xương đòn', 4, 8),
        (26, N'ĐTLT_64_27', N'Bài 27: PHCN chấn thương chi trên - PHCN gãy trên lồi cầu xương cánh tay', 4, 8),
        (27, N'ĐTLT_64_28', N'Bài 28: PHCN chấn thương chi trên - PHCN gãy 2 xương cẳng tay', 4, 8),
        (28, N'ĐTLT_64_29', N'Bài 29: PHCN chấn thương chi trên - PHCN gãy đầu dưới xương quay', 4, 8),
        (29, N'ĐTLT_64_30', N'Bài 30: PHCN chấn thương chi dưới - PHCN gãy cổ xương đùi', 4, 8),
        (30, N'ĐTLT_64_31', N'Bài 31: PHCN chấn thương chi dưới - PHCN gãy thân xương đùi', 4, 8),
        (31, N'ĐTLT_64_32', N'Bài 32: PHCN chấn thương chi dưới - PHCN chấn thương khung chậu', 4, 8),
        (32, N'ĐTLT_64_33', N'Bài 33: PHCN chấn thương chi dưới - PHCN tổn thương mô mềm', 4, 8),
        (33, N'ĐTLT_64_34', N'Bài 34: PHCN bệnh lý chi trên - PHCN viêm quanh khớp vai', 4, 8),
        (34, N'ĐTLT_64_35', N'Bài 35: PHCN bệnh lý chi trên - PHCN viêm mỏm trên lồi cầu ngoài xương cánh tay', 4, 8),
        (35, N'ĐTLT_64_36', N'Bài 36: PHCN bệnh lý chi trên - PHCN viêm mỏm trâm quay', 4, 8),
        (36, N'ĐTLT_64_37', N'Bài 37: PHCN bệnh lý chi dưới - PHCN viêm cân gan chân', 4, 8),
        (37, N'ĐTLT_64_38', N'Bài 38: PHCN bệnh lý chi dưới - PHCN thoái hóa khớp', 4, 12),
        (38, N'ĐTLT_64_39', N'Bài 39: PHCN bệnh lý cột sống và đĩa đệm - PHCN thoái hóa cột sống', 4, 12),
        (39, N'ĐTLT_64_40', N'Bài 40: PHCN bệnh lý cột sống và đĩa đệm - PHCN thoát vị đĩa đệm cột sống', 4, 12),
        (40, N'ĐTLT_64_41', N'Bài 41: PHCN bệnh nhân đột quỵ não', 4, 16),
        (41, N'ĐTLT_64_42', N'Bài 42: PHCN chấn thương sọ não', 4, 16),
        (42, N'ĐTLT_64_43', N'Bài 43: PHCN tổn thương tủy sống', 4, 16),
        (43, N'ĐTLT_64_44', N'Bài 44: PHCN co cứng', 4, 16),
        (44, N'ĐTLT_64_45', N'Bài 45: PHCN tổn thương thần kinh ngoại biên chi trên', 12, 24),
        (45, N'ĐTLT_64_46', N'Bài 46: PHCN hội chứng cổ vai tay', 4, 8),
        (46, N'ĐTLT_64_47', N'Bài 47: PHCN bệnh lý thần kinh chi dưới', 8, 16),
        (47, N'ĐTLT_64_48', N'Bài 48: PHCN liệt dây VII ngoại biên', 4, 8),
        (48, N'ĐTLT_64_49', N'Bài 49: PHCN viêm đa rễ, đa dây thần kinh (HC gullain barre)', 4, 8),
        (49, N'ĐTLT_64_50', N'Bài 50: PHCN viêm phế quản mạn tính', 4, 8),
        (50, N'ĐTLT_64_51', N'Bài 51: PHCN trước và sau phẫu thuật ngực', 4, 8),
        (51, N'ĐTLT_64_52', N'Bài 52: PHCN cho trẻ di chứng viêm não', 4, 4),
        (52, N'ĐTLT_64_53', N'Bài 53: PHCN cho trẻ chậm phát triển tinh thần', 4, 4),
        (53, N'ĐTLT_64_54', N'Bài 54: PHCN bệnh lý tim mạch', 8, 8),
        (54, N'ĐTLT_64_55', N'Bài 55: PHCN cho người bệnh bỏng', 4, 12),
        (55, N'ĐTLT_64_56', N'Bài 56: PHCN loét do đè ép', 4, 12),
        (56, N'ĐTLT_64_57', N'Bài 57: PHCN cho người bệnh vá da', 4, 12),
        (57, N'ĐTLT_64_58', N'Bài 58: PHCN tiểu tiện không tự chủ', 4, 12),
        (58, N'ĐTLT_64_59', N'Khai giảng, pre-test; Kiểm tra cuối khoá, bế giảng', 8, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_65: 21 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_65');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_65_01', N'Khai giảng, pre-test', 2, 0),
        (1, N'ĐTLT_65_02', N'Bài 1: Hồi sinh tim phổi cơ bản', 4, 20),
        (2, N'ĐTLT_65_03', N'Bài 2: Hồi sinh tim phổi nâng cao', 4, 20),
        (3, N'ĐTLT_65_04', N'Bài 3: Sốc nhiễm khuẩn', 4, 40),
        (4, N'ĐTLT_65_05', N'Bài 4: Phản vệ', 4, 28),
        (5, N'ĐTLT_65_06', N'Bài 5: Sốc giảm thể tích', 4, 28),
        (6, N'ĐTLT_65_07', N'Bài 6: Nhiễm toan chuyển hóa', 4, 20),
        (7, N'ĐTLT_65_08', N'Bài 7: Nhiễm toan hô hấp', 4, 20),
        (8, N'ĐTLT_65_09', N'Bài 8: Tăng Kali máu', 4, 20),
        (9, N'ĐTLT_65_10', N'Bài 9: Hạ Kali máu', 4, 20),
        (10, N'ĐTLT_65_11', N'Bài 10: Tăng Natri máu', 4, 20),
        (11, N'ĐTLT_65_12', N'Bài 11: Hạ Natri máu', 4, 20),
        (12, N'ĐTLT_65_13', N'Bài 12: Suy hô hấp cấp', 4, 20),
        (13, N'ĐTLT_65_14', N'Bài 13: Hội chứng suy hô hấp cấp tiến triển', 4, 20),
        (14, N'ĐTLT_65_15', N'Bài 14: Một số vấn đề cơ bản về phương thức và thông số thông khí cơ học', 4, 40),
        (15, N'ĐTLT_65_16', N'Bài 15: Mở khí quản', 4, 20),
        (16, N'ĐTLT_65_17', N'Bài 16: Kỹ thuật đặt catheter tĩnh mạch trung tâm', 4, 20),
        (17, N'ĐTLT_65_18', N'Bài 17: Kỹ thuật đặt dẫn lưu màng phổi', 4, 20),
        (18, N'ĐTLT_65_19', N'Bài 18: Kỹ thuật đặt catheter động mạch', 4, 20),
        (19, N'ĐTLT_65_20', N'Bài 19: Kỹ thuật đặt nội khí quản', 4, 20),
        (20, N'ĐTLT_65_21', N'Kiểm tra cuối khoá, bế giảng', 4, 0);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_66: 30 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_66');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_66_01', N'Khai giảng, kiểm tra đầu vào', 5, 0),
        (1, N'ĐTLT_66_02', N'Bài 1: Tổng quan lọc máu liên tục', 5, 0),
        (2, N'ĐTLT_66_03', N'Bài 2: Trang thiết bị triển khai lọc máu liên tục', 5, 5),
        (3, N'ĐTLT_66_04', N'Bài 3: Màng lọc sử dụng trong lọc máu liên tục', 5, 0),
        (4, N'ĐTLT_66_05', N'Bài 4: Các loại dịch lọc sử dụng trong lọc máu liên tục', 5, 5),
        (5, N'ĐTLT_66_06', N'Bài 5: Điều chỉnh liều thuốc trong lọc máu liên tục', 5, 5),
        (6, N'ĐTLT_66_07', N'Bài 6: Sử dụng thuốc chống đông trong lọc máu liên tục', 5, 5),
        (7, N'ĐTLT_66_08', N'Bài 7: Sử dụng thuốc chống đông trong lọc máu hấp phụ', 5, 5),
        (8, N'ĐTLT_66_09', N'Bài 8: Các phương thức lọc máu liên tục', 10, 10),
        (9, N'ĐTLT_66_10', N'Bài 9: Tổng quan về lọc huyết tương', 10, 20),
        (10, N'ĐTLT_66_11', N'Bài 10: Tổng quan về quy trình gan nhân tạo (MARS)', 5, 0),
        (11, N'ĐTLT_66_12', N'Bài 11: Tổng quan về lọc máu hấp phụ', 5, 20),
        (12, N'ĐTLT_66_13', N'Bài 12: Quy trình lọc máu liên tục trong điều trị bệnh nhân viêm tụy cấp nặng', 5, 25),
        (13, N'ĐTLT_66_14', N'Bài 13: Quy trình lọc máu liên tục trong điều trị bệnh nhân nhiễm khuẩn nặng/sốc nhiễm khuẩn', 5, 30),
        (14, N'ĐTLT_66_15', N'Bài 14: Quy trình lọc huyết tương bằng máy ly tâm', 5, 10),
        (15, N'ĐTLT_66_16', N'Bài 15: Quy trình lọc máu liên tục trong điều trị bệnh nhân suy đa phủ tạng', 5, 30),
        (16, N'ĐTLT_66_17', N'Bài 16: Quy trình kỹ thuật lọc huyết tương với 2 quả lọc', 5, 0),
        (17, N'ĐTLT_66_18', N'Bài 17: Quy trình kỹ thuật lọc huyết tương trong điều trị hội chứng Guillain-Barré', 5, 20),
        (18, N'ĐTLT_66_19', N'Bài 18: Quy trình kỹ thuật lọc gan nhân tạo trong điều trị suy gan cấp', 5, 0),
        (19, N'ĐTLT_66_20', N'Bài 19: Quy trình kỹ thuật lọc huyết tương trong điều trị cơn nhược cơ nặng', 5, 20),
        (20, N'ĐTLT_66_21', N'Bài 20: Quy trình thay huyết tương trong điều trị suy gan cấp', 5, 30),
        (21, N'ĐTLT_66_22', N'Bài 21: Quy trình kỹ thuật lọc huyết tương trong điều trị bệnh nhân viêm tụy cấp do tăng triglycerid', 5, 20),
        (22, N'ĐTLT_66_23', N'Bài 22: Quy trình lọc máu liên tục cho bệnh nhân suy hô hấp cấp tiến triển (ARDS)', 5, 30),
        (23, N'ĐTLT_66_24', N'Bài 23: Cấp cứu ngừng tuần hoàn', 5, 15),
        (24, N'ĐTLT_66_25', N'Bài 24: Chẩn đoán và xử trí tình trạng sốc phản vệ', 5, 10),
        (25, N'ĐTLT_66_26', N'Bài 25: Kiểm soát nhiễm khuẩn trong lọc máu liên tục', 5, 15),
        (26, N'ĐTLT_66_27', N'Bài 26: Nước sử dụng trong lọc máu', 5, 5),
        (27, N'ĐTLT_66_28', N'Bài 27: Quy trình đặt catheter lọc máu', 5, 10),
        (28, N'ĐTLT_66_29', N'Bài 28: Quy trình lọc huyết tương trong điều trị các bệnh tự miễn (lupus, viêm da cơ, TTP...)', 5, 20),
        (29, N'ĐTLT_66_30', N'Khai giảng, bế giảng, ôn tập, kiểm tra', 5, 25);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO
-- ĐTLT_67: 14 bài
DECLARE @pid VARCHAR(20) = (SELECT id FROM training_programs WHERE code = N'ĐTLT_67');
IF @pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_programs WHERE program_id = @pid)
BEGIN
    DECLARE @l TABLE (ord INT, code NVARCHAR(50), title NVARCHAR(255), th INT, ph INT);
    DECLARE @ids TABLE (id VARCHAR(20), code NVARCHAR(50));
    INSERT @l (ord, code, title, th, ph) VALUES
        (0, N'ĐTLT_67_01', N'Khai giảng, kiểm tra đầu vào', 5, 0),
        (1, N'ĐTLT_67_02', N'Tổng quan lọc máu liên tục; Tổng quan thay huyết tương', 8, 24),
        (2, N'ĐTLT_67_03', N'Trang thiết bị triển khai lọc máu liên tục', 8, 12),
        (3, N'ĐTLT_67_04', N'Sử dụng thuốc chông đông trong lọc máu Liên tục', 8, 16),
        (4, N'ĐTLT_67_05', N'Các phương thức lọc máu liên tục', 10, 40),
        (5, N'ĐTLT_67_06', N'Lắp và cài đặt các thông số, vận hành máy lọc máu liên tục và thay huyết tương', 20, 60),
        (6, N'ĐTLT_67_07', N'Quy trình kỹ thuật lọc máu liên tục', 12, 48),
        (7, N'ĐTLT_67_08', N'Quy trình kỹ thuật thay huyết tương', 12, 48),
        (8, N'ĐTLT_67_09', N'Hướng dẫn theo dõi, ghi chép các thông số bệnh nhân và các thông số lọc máu.', 8, 16),
        (9, N'ĐTLT_67_10', N'Cấp cứu ngừng tuần hoàn', 8, 24),
        (10, N'ĐTLT_67_11', N'Chẩn đoán và xử trí tình trạng sốc phản vệ', 8, 24),
        (11, N'ĐTLT_67_12', N'Quy trình đặt catheter lọc máu', 8, 24),
        (12, N'ĐTLT_67_13', N'Các biện pháp phòng chống nhiễm khuẩn', 8, 16),
        (13, N'ĐTLT_67_14', N'Khai giảng, bế giảng, ôn tập, kiểm tra', 5, 25);
    INSERT program_lessons (id, code, title, theory_hours, practice_hours, lesson_kind, created_by)
    OUTPUT inserted.id, inserted.code INTO @ids
    SELECT 'BL' + LEFT(REPLACE(NEWID(), '-', ''), 18), code, title, th, ph, 'theory', 'SYSTEM' FROM @l;
    INSERT lesson_programs (id, lesson_id, program_id, display_order, created_by)
    SELECT 'LP' + LEFT(REPLACE(NEWID(), '-', ''), 18), i.id, @pid, l.ord, 'SYSTEM'
    FROM @l l JOIN @ids i ON i.code = l.code;
END
GO

PRINT N'✅ Migration 2026-11-13_dtlt_programs_lessons_data hoàn tất.';
GO
