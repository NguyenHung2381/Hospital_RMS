/* ============================================================================
 * 2026-12-23_thang_diem_bai_kiem_tra_hoi_thao
 * ----------------------------------------------------------------------------
 *   Bài kiểm tra cuối buổi của hội thảo / hội nghị: thêm "thang điểm tối đa"
 *   (vd 10 hoặc 100) do ban tổ chức đặt riêng.
 *
 *   seminars.test_score_scale numeric(7,2):
 *     NULL — như cũ: thang = tổng điểm các câu đã soạn, điểm đạt so thẳng với
 *            điểm thô (seminar_participants.test_score / test_correct).
 *     > 0  — điểm của người làm được quy đổi:
 *              điểm thô ÷ điểm tối đa của bài (test_max_score / test_total) × thang
 *            (làm tròn 2 chữ số) rồi mới so với test_pass_score — xem
 *            utils/seminarTest.scaledScore / SCALED_SCORE_SQL.
 *
 *   Không backfill: hội thảo cũ giữ NULL ⇒ chấm điểm, cấp CME, xuất Excel như trước.
 *
 * Chạy trong 1 transaction. Idempotent.
 * ==========================================================================*/

ALTER TABLE seminars ADD COLUMN IF NOT EXISTS test_score_scale numeric(7,2);
