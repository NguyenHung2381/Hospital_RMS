/* ============================================================================
 * 2026-12-18_xoa_ghe_thay_the_de_tai_roi_hoi_dong
 * ----------------------------------------------------------------------------
 *   Ghế thay thế theo đề tài (council_seat_substitutes) chỉ có nghĩa khi đề tài
 *   đang thuộc một hội đồng. Trước đây gỡ đề tài khỏi hội đồng / xóa hội đồng
 *   không xóa ghế thay thế ⇒ người thay ghế vẫn giữ vai chủ tịch/thư ký/phản
 *   biện với đề tài đó (và với hội đồng mới nếu đề tài được gán lại). Code mới
 *   xóa ghế khi đề tài rời hội đồng (councilAssignmentService, councilService);
 *   file này dọn các ghế mồ côi còn sót từ trước.
 *   Không phát hiện được ghế của đề tài đã chuyển thẳng sang hội đồng khác (bảng
 *   không lưu hội đồng của ghế) — các ghế đó cần quản trị rà lại thủ công.
 * Idempotent: chạy lại không còn gì để xóa.
 * ==========================================================================*/

DELETE FROM council_seat_substitutes s
WHERE NOT EXISTS (
  SELECT 1 FROM topics t WHERE t.id = s.topic_id AND t.council_id IS NOT NULL
);
