/* ============================================================================
 * 2026-12-25_chuyen_bai_hoc_tieu_hoa_tren_sang_dtlt68
 * ----------------------------------------------------------------------------
 *   Sửa 2026-12-24_cap_nhat_bai_hoc_noi_soi_tieu_hoa_tren: 14 bài của khóa
 *   "Nội soi chẩn đoán đường tiêu hóa trên" bị gắn nhầm vào ĐTLT_6 ("Nội soi
 *   tiêu hóa cơ bản"). Chương trình đúng là ĐTLT_68.
 *
 *   Với từng bài ĐTLT_6_01 … ĐTLT_6_14 do migration đó tạo (created_by SYSTEM):
 *     - chuyển liên kết lesson_programs từ ĐTLT_6 sang ĐTLT_68 (giữ display_order);
 *     - đổi mã bài thành ĐTLT_68_01 … ĐTLT_68_14.
 *   Bỏ qua bài nếu mã ĐTLT_68_NN đã có. DB không có ĐTLT_6 hoặc ĐTLT_68 → không
 *   làm gì. Lúc viết, trên production 14 bài này chưa được lớp, buổi học hay
 *   điểm nào dùng.
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

DROP TABLE IF EXISTS pg_temp.tmp_chuyen_dtlt68;
CREATE TEMP TABLE tmp_chuyen_dtlt68 ON COMMIT DROP AS
SELECT pl.id AS lesson_id,
	'ĐTLT_68_' || lpad(n::text, 2, '0') AS new_code,
	p6.id AS old_program_id,
	p68.id AS new_program_id
FROM generate_series(1, 14) AS n
JOIN program_lessons pl ON pl.code = 'ĐTLT_6_' || lpad(n::text, 2, '0') AND pl.created_by = 'SYSTEM'
JOIN training_programs p6 ON p6.code = 'ĐTLT_6'
JOIN training_programs p68 ON p68.code = 'ĐTLT_68'
WHERE NOT EXISTS (
	SELECT 1 FROM program_lessons x WHERE x.code = 'ĐTLT_68_' || lpad(n::text, 2, '0')
);

-- 1) Chuyển liên kết sang ĐTLT_68
UPDATE lesson_programs lp
SET program_id = t.new_program_id,
	updated_at = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
	updated_by = 'SYSTEM'
FROM tmp_chuyen_dtlt68 t
WHERE lp.lesson_id = t.lesson_id
	AND lp.program_id = t.old_program_id
	AND NOT EXISTS (
		SELECT 1 FROM lesson_programs y WHERE y.lesson_id = t.lesson_id AND y.program_id = t.new_program_id
	);

-- Đã gắn ĐTLT_68 sẵn → chỉ gỡ liên kết thừa với ĐTLT_6
DELETE FROM lesson_programs lp
USING tmp_chuyen_dtlt68 t
WHERE lp.lesson_id = t.lesson_id AND lp.program_id = t.old_program_id;

-- 2) Đổi mã bài
UPDATE program_lessons pl
SET code = t.new_code,
	updated_at = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
	updated_by = 'SYSTEM'
FROM tmp_chuyen_dtlt68 t
WHERE pl.id = t.lesson_id;
