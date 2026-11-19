/* ============================================================================
 * 2026-12-24_cap_nhat_bai_hoc_noi_soi_tieu_hoa_tren
 * ----------------------------------------------------------------------------
 *   Cập nhật 14 bài học của chương trình ĐTLT_6 "Nội soi chẩn đoán đường tiêu
 *   hóa trên" theo mục 4 (Chương trình chi tiết) của văn bản chương trình đào
 *   tạo liên tục: tên bài, số tiết LT/TH, mục tiêu học tập (description).
 *
 *   Mã bài theo quy ước scripts/import-dtlt-lessons.js: ĐTLT_6_01 … ĐTLT_6_14,
 *   bài khai giảng / kiểm tra đầu vào xếp đầu.
 *     - Bài đã có mã đó → cập nhật tên, số tiết, mô tả.
 *     - Chưa có → tạo mới (lesson_kind theory).
 *     - Gắn vào ĐTLT_6 (lesson_programs), đặt lại display_order.
 *   Không xóa bài nào. Văn bản ghi tổng 480 tiết (60+420) nhưng cộng từng dòng
 *   chỉ được 470 (62+408) — ở đây lấy theo từng dòng.
 *
 *   DB không có chương trình ĐTLT_6 (dev, test) → không làm gì.
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

CREATE TEMP TABLE tmp_bai_hoc_dtlt6 (
	stt int NOT NULL,
	title varchar(255) NOT NULL,
	theory int NOT NULL,
	practice int NOT NULL,
	description text
) ON COMMIT DROP;

INSERT INTO tmp_bai_hoc_dtlt6 (stt, title, theory, practice, description) VALUES
(1,  'Khai giảng, kiểm tra đầu vào', 4, 0, NULL),
(2,  'Đơn vị nội soi tiêu hóa', 4, 0,
'1. Hiểu được những yêu cầu cơ bản của đơn vị nội soi ở bệnh viện tuyến tỉnh.
2. Biết được cách thiết kế phòng nội soi một cách hợp lý.
3. Trình bày được cách thiết kế và bố trí hợp lý các phòng trong đơn vị nội soi: phòng nội soi, phòng rửa máy và dụng cụ, phòng tiếp đón, phòng chuẩn bị bệnh nhân trước khi soi, phòng lưu bệnh nhân sau khi làm thủ thuật...'),
(3,  'Nguyên lý cấu tạo và cách sử dụng máy nội soi', 4, 16,
'1. Nắm được cấu tạo và nguyên lý hoạt động của các loại máy: nội soi, nguồn sáng, máy cắt đốt, máy in ảnh, màn hình, kìm sinh thiết, catheter nhuộm màu…
2. Nắm được cách thao tác máy nội soi và sử dụng các nút chức năng đúng kỹ thuật.
3. Nắm được cách sử dụng đúng nguồn sáng, nguồn cắt đốt, kìm sinh thiết và catheter nhuộm màu.'),
(4,  'Chống nhiễm khuẩn trong nội soi', 4, 16,
'1. Nắm được tác hại của việc khử khuẩn không đúng cách máy nội soi và các dụng cụ dùng trong nội soi. Nắm được nguyên tắc phân loại mức độ khử khuẩn của máy nội soi và các dụng cụ dùng trong nội soi.
2. Nắm được ưu nhược điểm của các chất khử khuẩn đang được dùng hiện nay. Nắm được cách khử khuẩn (rửa) máy nội soi và các dụng cụ dùng trong nội soi.
3. Nắm được nguyên tắc dùng thuốc kháng sinh dự phòng nhiễm khuẩn trong nội soi.'),
(5,  'Chỉ định, chống chỉ định và tai biến của nội soi thực quản dạ dày tá tràng', 4, 42,
'1. Nắm được chỉ định và chống chỉ định của nội soi thực quản - dạ dày - tá tràng.
2. Nắm được các tai biến có thể xảy ra trong nội soi thực quản dạ dày tá tràng.
3. Nắm được cách phát hiện và xử lý các biến chứng xảy ra trong khi soi.'),
(6,  'Hình ảnh nội soi bình thường và bệnh lý của thực quản', 8, 92,
'1. Nắm được cách nhận biết hình ảnh nội soi thực quản bình thường.
2. Biết được hình ảnh đường Z trong trường hợp bình thường và bệnh lý.
3. Trình bày được cách nhận biết hình ảnh một số bệnh lý của thực quản qua nội soi như viêm thực quản, u thực quản, thoát vị thực quản…'),
(7,  'Hình ảnh bình thường và bệnh lý của dạ dày qua nội soi', 8, 92,
'1. Biết được các hình ảnh nội soi bình thường của dạ dày tá tràng bao gồm: màu sắc, bề mặt niêm mạc, nhu động.
2. Nắm được cách xác định vị trí giải phẫu qua nội soi (mặt trước, sau, phình vị, thân vị, hang vị, góc bờ cong nhỏ, BCL, hành tá tràng và tá tràng).
3. Biết được các hình ảnh nội soi của một số bệnh lý hay gặp ở dạ dày tá tràng.'),
(8,  'Kỹ thuật soi thực quản dạ dày tá tràng', 4, 96,
'1. Trình bày được nguyên tắc cầm máy nội soi, nguyên tắc đi máy qua vùng hầu họng, qua vùng tâm vị, qua lỗ môn vị, xuống hành tá tràng, kỹ thuật soi ngược.
2. Hiểu được nguyên tắc quan sát tổn thương trong nội soi thực quản - dạ dày - tá tràng.
3. Biết được cách chuẩn bị cho một cuộc soi thực quản - dạ dày - tá tràng.
4. Nắm được nguyên lý kỹ thuật dùng đoạn ống nhựa trong gắn vào đầu máy nội soi trong nội soi thực quản - dạ dày - tá tràng để chẩn đoán và điều trị.'),
(9,  'Kỹ thuật nhuộm màu trong nội soi đường tiêu hóa trên', 4, 16,
'1. Trình bày được giá trị của nhuộm màu và sinh thiết trong nội soi chẩn đoán.
2. Biết được chỉ định áp dụng đối với các kỹ thuật nhuộm màu và sinh thiết trong nội soi đường tiêu hoá trên.
3. Làm được kỹ thuật làm sinh thiết, kỹ thuật nhuộm màu.'),
(10, 'Kỹ thuật sinh thiết qua nội soi', 2, 16,
'1. Nắm được các chỉ định và chống chỉ định của sinh thiết qua nội soi.
2. Làm được kỹ thuật sinh thiết qua nội soi.
3. Hiểu được những chú ý khi thực hiện kỹ thuật sinh thiết trong nội soi.'),
(11, 'Kỹ thuật xét nghiệm vi khuẩn Helicobacter Pylori', 4, 14,
'1. Nêu được giá trị của xét nghiệm tìm vi khuẩn Helicobacter pylori.
2. Kể ra được các kỹ thuật xét nghiệm tìm Helicobacter pylori.'),
(12, 'Kiểm tra giữa khóa học', 4, 0, NULL),
(13, 'Thi kết thúc khóa học', 4, 8, NULL),
(14, 'Tổng kết khóa học, nhận chứng chỉ', 4, 0, NULL);

-- 1) Cập nhật bài đã có (khớp theo mã ĐTLT_6_NN)
UPDATE program_lessons pl
SET title = t.title,
	theory_hours = t.theory,
	practice_hours = t.practice,
	description = t.description,
	lesson_kind = 'theory',
	updated_at = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
	updated_by = 'SYSTEM'
FROM tmp_bai_hoc_dtlt6 t
WHERE pl.code = 'ĐTLT_6_' || lpad(t.stt::text, 2, '0')
	AND EXISTS (SELECT 1 FROM training_programs WHERE code = 'ĐTLT_6');

-- 2) Thêm bài còn thiếu
INSERT INTO program_lessons (id, code, title, description, theory_hours, practice_hours, lesson_kind, created_by)
SELECT CONCAT('BL', UPPER(LEFT(REPLACE(CAST(gen_random_uuid() AS VARCHAR(36)), '-', ''), 18))),
	'ĐTLT_6_' || lpad(t.stt::text, 2, '0'), t.title, t.description, t.theory, t.practice, 'theory', 'SYSTEM'
FROM tmp_bai_hoc_dtlt6 t
WHERE EXISTS (SELECT 1 FROM training_programs WHERE code = 'ĐTLT_6')
	AND NOT EXISTS (
		SELECT 1 FROM program_lessons pl WHERE pl.code = 'ĐTLT_6_' || lpad(t.stt::text, 2, '0')
	);

-- 3) Gắn vào chương trình ĐTLT_6 và đặt lại thứ tự
INSERT INTO lesson_programs (id, lesson_id, program_id, display_order, created_by)
SELECT CONCAT('LP', UPPER(LEFT(REPLACE(CAST(gen_random_uuid() AS VARCHAR(36)), '-', ''), 18))),
	pl.id, p.id, t.stt - 1, 'SYSTEM'
FROM tmp_bai_hoc_dtlt6 t
JOIN program_lessons pl ON pl.code = 'ĐTLT_6_' || lpad(t.stt::text, 2, '0')
JOIN training_programs p ON p.code = 'ĐTLT_6'
ON CONFLICT ON CONSTRAINT uq_lsnprog_lesson_program
DO UPDATE SET display_order = EXCLUDED.display_order,
	updated_at = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
	updated_by = 'SYSTEM';
